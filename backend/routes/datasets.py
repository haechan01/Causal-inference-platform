"""
Dataset-specific routes.
Handles dataset schema and analysis endpoints.
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
import os
import boto3
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import base64
from io import BytesIO
from scipy.stats import t, norm
import math
from models import Dataset
from utils.did_analysis import check_parallel_trends

# Create blueprint
datasets_bp = Blueprint('datasets', __name__, url_prefix='/api/datasets')


def sanitize_for_json(obj):
    """
    Recursively convert NaN and infinity values to None for JSON serialization.
    """
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(item) for item in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    elif isinstance(obj, (np.integer, np.floating)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj) if isinstance(obj, np.floating) else int(obj)
    else:
        return obj


def create_did_chart(df, outcome_var, time_var, treatment_start, start_period, end_period, unit_var, treatment_units, control_units):
    """Create a matplotlib chart for DiD analysis using unit-based assignment.
    Returns both PNG (base64) and structured data for interactive charts."""
    try:
        # Convert parameters to appropriate types
        if pd.api.types.is_numeric_dtype(df[time_var]):
            treatment_start = float(treatment_start)
            start_period = float(start_period)
            end_period = float(end_period)
        else:
            treatment_start = str(treatment_start)
            start_period = str(start_period)
            end_period = str(end_period)
        
        # Filter data to analysis period
        df_filtered = df[(df[time_var] >= start_period) & (df[time_var] <= end_period)].copy()
        print(f"Chart: Filtered data from {start_period} to {end_period}, rows: {len(df_filtered)}")
        print(f"Chart: Unique time periods: {sorted(df_filtered[time_var].unique())}")
        
        # Use unit-based treatment assignment (same as main analysis)
        if treatment_units and control_units:
            # Filter to only include selected units
            df_filtered = df_filtered[df_filtered[unit_var].isin(treatment_units + control_units)]
            # Create treatment indicator based on selected units
            df_filtered['is_treated'] = df_filtered[unit_var].isin(treatment_units).astype(int)
            print(f"Chart: After unit filtering, rows: {len(df_filtered)}")
        else:
            # Fallback to original logic if units not specified
            df_filtered['is_treated'] = 0  # Default to control
        
        df_filtered['post_treatment'] = (df_filtered[time_var] >= treatment_start).astype(int)
        
        # Calculate means by group and time period
        time_series_data = df_filtered.groupby([time_var, 'is_treated'])[outcome_var].mean().reset_index()
        print(f"Chart: Time series data shape: {time_series_data.shape}")
        print(f"Chart: Time series unique periods: {sorted(time_series_data[time_var].unique())}")
        
        # Separate treated and control groups
        treated_data = time_series_data[time_series_data['is_treated'] == 1].sort_values(time_var)
        control_data = time_series_data[time_series_data['is_treated'] == 0].sort_values(time_var)
        
        # Calculate counterfactual: what would have happened to treatment group without intervention
        # Counterfactual_t = Treatment_pre_mean + (Control_t - Control_pre_mean)
        counterfactual_data = None
        if len(treated_data) > 0 and len(control_data) > 0:
            # Get pre-treatment means
            pre_treated = treated_data[treated_data[time_var] < treatment_start]
            pre_control = control_data[control_data[time_var] < treatment_start]
            
            if len(pre_treated) > 0 and len(pre_control) > 0:
                pre_treatment_mean_treated = pre_treated[outcome_var].mean()
                pre_treatment_mean_control = pre_control[outcome_var].mean()
                
                # Calculate counterfactual for all periods
                counterfactual_values = []
                counterfactual_periods = []
                
                for period in sorted(time_series_data[time_var].unique()):
                    control_at_period = control_data[control_data[time_var] == period]
                    if len(control_at_period) > 0:
                        control_mean_at_period = control_at_period[outcome_var].iloc[0]
                        # Counterfactual = treatment pre-mean + (control at period - control pre-mean)
                        counterfactual = pre_treatment_mean_treated + (control_mean_at_period - pre_treatment_mean_control)
                        counterfactual_values.append(counterfactual)
                        counterfactual_periods.append(period)
                
                if len(counterfactual_periods) > 0:
                    counterfactual_data = pd.DataFrame({
                        time_var: counterfactual_periods,
                        'counterfactual': counterfactual_values
                    }).sort_values(time_var)
        
        # Prepare structured data for interactive chart
        chart_data = {
            'xAxisLabel': time_var,
            'yAxisLabel': outcome_var,
            'title': 'Difference-in-Differences Analysis Over Time',
            'treatmentStart': treatment_start,
            'treatmentStartLabel': 'Treatment Starts',
            'series': []
        }
        
        # Add treated group data
        if len(treated_data) > 0:
            chart_data['series'].append({
                'name': 'Treatment Group',
                'data': treated_data[[time_var, outcome_var]].to_dict('records'),
                'color': '#4F9CF9',
                'type': 'line'
            })
        
        # Add control group data
        if len(control_data) > 0:
            chart_data['series'].append({
                'name': 'Control Group',
                'data': control_data[[time_var, outcome_var]].to_dict('records'),
                'color': '#FF6B6B',
                'type': 'line'
            })
        
        # Add counterfactual data
        if counterfactual_data is not None and len(counterfactual_data) > 0:
            chart_data['series'].append({
                'name': 'Counterfactual',
                'data': counterfactual_data[[time_var, 'counterfactual']].rename(columns={'counterfactual': outcome_var}).to_dict('records'),
                'color': '#9CA3AF',
                'type': 'dashed'
            })
        
        # Create the chart with good size and quality
        plt.figure(figsize=(12, 7))
        
        # Plot time series lines
        if len(treated_data) > 0:
            plt.plot(treated_data[time_var], treated_data[outcome_var], 'o-', 
                    color='#4F9CF9', linewidth=2, label='Treatment Group', markersize=6)
        
        if len(control_data) > 0:
            plt.plot(control_data[time_var], control_data[outcome_var], 'o-', 
                    color='#FF6B6B', linewidth=2, label='Control Group', markersize=6)
        
        # Plot counterfactual line (dashed)
        if counterfactual_data is not None and len(counterfactual_data) > 0:
            plt.plot(counterfactual_data[time_var], counterfactual_data['counterfactual'], '--', 
                    color='#9CA3AF', linewidth=2, label='Counterfactual', alpha=0.8)
        
        # Add vertical line for treatment start
        plt.axvline(x=treatment_start, color='red', linestyle='--', alpha=0.7, linewidth=2)
        plt.text(treatment_start, plt.ylim()[1] * 0.9, 'Treatment Starts', 
                rotation=90, verticalalignment='top', 
                horizontalalignment='right', fontsize=10, color='red')
        
        # Customize the chart
        plt.xlabel(f'{time_var}', fontsize=12)
        plt.ylabel(f'{outcome_var}', fontsize=12)
        plt.title('Difference-in-Differences Analysis Over Time', fontsize=14, fontweight='bold')
        plt.legend()
        plt.grid(True, alpha=0.3)
        
        # Rotate x-axis labels if there are many time points
        if len(time_series_data[time_var].unique()) > 6:
            plt.xticks(rotation=45)
        
        # Save to base64 string with high quality
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        chart_base64 = base64.b64encode(buffer.getvalue()).decode()
        plt.close()
        
        print(f"Chart created successfully, size: {len(chart_base64)} characters")
        return {
            'png': chart_base64,
            'data': chart_data
        }
        
    except Exception as e:
        print(f"Error creating chart: {str(e)}")
        import traceback
        traceback.print_exc()
        return None


def create_pretreatment_trends_chart(df, outcome_var, time_var, treatment_var, 
                                     treatment_value, start_period, treatment_start, unit_var, treatment_units, control_units):
    """Create chart showing pre-treatment trends for parallel trends assessment."""
    try:
        # Convert parameters to appropriate types
        if pd.api.types.is_numeric_dtype(df[treatment_var]):
            try:
                treatment_value = float(treatment_value)
            except (ValueError, TypeError):
                treatment_value = str(treatment_value)
        else:
            treatment_value = str(treatment_value)
        
        if pd.api.types.is_numeric_dtype(df[time_var]):
            treatment_start = float(treatment_start)
            start_period = float(start_period)
        else:
            treatment_start = str(treatment_start)
            start_period = str(start_period)
        
        # Filter to pre-treatment period only
        df_pre = df[(df[time_var] >= start_period) & (df[time_var] < treatment_start)].copy()
        
        if len(df_pre) == 0:
            return None
        
        # Use unit-based treatment assignment (same as main analysis)
        if treatment_units and control_units:
            # Filter to only include selected units
            df_pre = df_pre[df_pre[unit_var].isin(treatment_units + control_units)]
            # Create treatment indicator based on selected units
            df_pre['is_treated'] = df_pre[unit_var].isin(treatment_units).astype(int)
        else:
            # Fallback to treatment variable if units not specified
            df_pre['is_treated'] = (df_pre[treatment_var] == treatment_value).astype(int)
        
        # Calculate means by group and time period
        time_series_data = df_pre.groupby([time_var, 'is_treated'])[outcome_var].mean().reset_index()
        
        # Separate treated and control groups
        treated_data = time_series_data[time_series_data['is_treated'] == 1].sort_values(time_var)
        control_data = time_series_data[time_series_data['is_treated'] == 0].sort_values(time_var)
        
        # Create the chart with good size
        plt.figure(figsize=(12, 7))
        
        # Plot time series lines
        if len(treated_data) > 0:
            plt.plot(treated_data[time_var], treated_data[outcome_var], 'o-', 
                    color='#4F9CF9', linewidth=2, label='Treatment Group', markersize=6)
            
            # Add trend line for treatment group
            if len(treated_data) > 1:
                z_treated = np.polyfit(treated_data[time_var], treated_data[outcome_var], 1)
                p_treated = np.poly1d(z_treated)
                plt.plot(treated_data[time_var], p_treated(treated_data[time_var]), 
                        "--", color='#4F9CF9', alpha=0.7, linewidth=1)
        
        if len(control_data) > 0:
            plt.plot(control_data[time_var], control_data[outcome_var], 'o-', 
                    color='#FF6B6B', linewidth=2, label='Control Group', markersize=6)
            
            # Add trend line for control group
            if len(control_data) > 1:
                z_control = np.polyfit(control_data[time_var], control_data[outcome_var], 1)
                p_control = np.poly1d(z_control)
                plt.plot(control_data[time_var], p_control(control_data[time_var]), 
                        "--", color='#FF6B6B', alpha=0.7, linewidth=1)
        
        # Add vertical line for treatment start
        plt.axvline(x=treatment_start, color='red', linestyle='--', alpha=0.7, linewidth=2)
        plt.text(treatment_start, plt.ylim()[1] * 0.9, 'Treatment Starts', 
                rotation=90, verticalalignment='top', 
                horizontalalignment='right', fontsize=10, color='red')
        
        # Customize the chart
        plt.xlabel(f'{time_var}', fontsize=12)
        plt.ylabel(f'{outcome_var}', fontsize=12)
        plt.title('Pre-Treatment Trends (Parallel Trends Check)', fontsize=14, fontweight='bold')
        plt.legend()
        plt.grid(True, alpha=0.3)
        
        # Rotate x-axis labels if there are many time points
        if len(time_series_data[time_var].unique()) > 6:
            plt.xticks(rotation=45)
        
        # Save to base64 string with high quality
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        chart_base64 = base64.b64encode(buffer.getvalue()).decode()
        plt.close()
        
        print(f"Pre-treatment trends chart created, size: {len(chart_base64)} characters")
        return chart_base64
        
    except Exception as e:
        print(f"Error creating pre-treatment trends chart: {str(e)}")
        return None


# Get S3 configuration from environment
AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
S3_BUCKET_NAME = os.environ.get('AWS_S3_BUCKET_NAME')

# Configure S3 client
s3_client = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_REGION
)


@datasets_bp.route('/<int:dataset_id>/schema', methods=['GET'])
@jwt_required()
def get_dataset_schema(dataset_id):
    """Get schema information for a dataset."""
    try:
        current_user_id = get_jwt_identity()
        if not isinstance(current_user_id, str):
            raise ValueError("Invalid token identity")
        
        # Get dataset
        dataset = Dataset.query.get(dataset_id)
        if not dataset:
            return jsonify({"error": f"Dataset {dataset_id} not found"}), 404
        
        # Check if user has access to this dataset
        # Either directly owns it or owns the project it belongs to
        has_access = False
        if str(dataset.user_id) == str(current_user_id):
            has_access = True
        elif dataset.project and str(dataset.project.user_id) == str(current_user_id):
            has_access = True
        
        if not has_access:
            return jsonify({
                "error": "Access denied"
            }), 403

        # Download file from S3 to analyze schema
        s3_client = boto3.client(
            's3',
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
            region_name=AWS_REGION
        )

        # Create a temporary file to download the CSV
        temp_file_path = f"/tmp/temp_dataset_{dataset_id}.csv"
        
        try:
            # Download file from S3
            s3_client.download_file(
                S3_BUCKET_NAME, dataset.s3_key, temp_file_path
            )

            # Read CSV and analyze schema
            df = pd.read_csv(temp_file_path)

            # Analyze each column
            columns_info = []
            for column in df.columns:
                col_data = df[column]

                # Determine column type
                if pd.api.types.is_numeric_dtype(col_data):
                    col_type = 'numeric'
                elif pd.api.types.is_datetime64_any_dtype(col_data):
                    col_type = 'date'
                elif pd.api.types.is_bool_dtype(col_data):
                    col_type = 'boolean'
                else:
                    # Try to convert object/string columns to numeric if they appear to be numeric
                    # This handles cases where CSV columns are read as strings but should be numeric
                    non_null_data = col_data.dropna()
                    if len(non_null_data) > 0:
                        # Try converting to numeric
                        numeric_converted = pd.to_numeric(non_null_data, errors='coerce')
                        # Count how many successfully converted
                        successful_conversions = numeric_converted.notna().sum()
                        conversion_rate = successful_conversions / len(non_null_data)
                        
                        # If >80% of non-null values can be converted to numeric, treat as numeric
                        if conversion_rate > 0.8:
                            col_type = 'numeric'
                        else:
                            col_type = 'categorical'
                    else:
                        # All nulls - default to categorical
                        col_type = 'categorical'

                # Get unique values for categorical columns and binary numeric columns
                # For treatment/control unit selection, we need unique values even if there are many
                unique_values = None
                if col_type in ['categorical', 'boolean']:
                    unique_vals = col_data.dropna().unique()
                    print(f"Column '{column}' ({col_type}): {len(unique_vals)} unique values")
                    # Increase limit to 100 for categorical columns to support state/country selection
                    if len(unique_vals) <= 100:
                        unique_values = [str(val) for val in unique_vals]
                        print(f"  -> Providing {len(unique_values)} unique values")
                    else:
                        print(f"  -> Too many unique values ({len(unique_vals)}), providing first 100")
                        # For very large categorical columns, provide first 100 values
                        unique_values = [str(val) for val in unique_vals[:100]]
                elif col_type == 'numeric':
                    # For numeric columns, check if it's binary (only 2 unique values)
                    unique_vals = col_data.dropna().unique()
                    if len(unique_vals) <= 2:
                        unique_values = [str(val) for val in unique_vals]
                    # Also check for columns that might be treatment indicators
                    # even if they have more than 2 values, if they're mostly 0/1
                    elif column.lower() in ['treatment', 'treated', 'treatment_group', 'is_treated']:
                        # For treatment columns, always provide unique values
                        unique_vals = col_data.dropna().unique()
                        if len(unique_vals) <= 10:  # Reasonable limit for treatment values
                            unique_values = [str(val) for val in unique_vals]

                columns_info.append({
                    'name': column,
                    'type': col_type,
                    'unique_values': unique_values,
                    'unique_count': int(col_data.nunique()),
                    'null_count': int(col_data.isnull().sum()),
                    'total_count': len(col_data)
                })

            return jsonify({
                "dataset_id": dataset_id,
                "file_name": dataset.file_name,
                "columns": columns_info,
                "total_rows": len(df),
                "total_columns": len(df.columns)
            }), 200

        finally:
            # Clean up temporary file
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

    except ValueError:
        return jsonify({"error": "Invalid token identity"}), 401
    except Exception as e:
        return jsonify({
            "error": f"Failed to get dataset schema: {str(e)}"
        }), 500


@datasets_bp.route('/<int:dataset_id>/preview', methods=['GET'])
@jwt_required()
def get_dataset_preview(dataset_id):
    """Get data preview with summary statistics for a dataset."""
    try:
        current_user_id = get_jwt_identity()
        
        dataset = Dataset.query.get(dataset_id)
        if not dataset:
            return jsonify({"error": f"Dataset {dataset_id} not found"}), 404
        
        # Check if user has access to this dataset
        has_access = False
        if str(dataset.user_id) == str(current_user_id):
            has_access = True
        elif dataset.project and str(dataset.project.user_id) == str(current_user_id):
            has_access = True
        
        if not has_access:
            return jsonify({"error": "Access denied"}), 403

        # Create S3 client
        s3_client = boto3.client(
            's3',
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
            region_name=AWS_REGION
        )

        temp_file_path = f"/tmp/preview_{dataset_id}.csv"
        
        try:
            s3_client.download_file(S3_BUCKET_NAME, dataset.s3_key, temp_file_path)
            df = pd.read_csv(temp_file_path)
            
            # Validate that the DataFrame has data
            if df.empty or len(df.columns) == 0:
                return jsonify({
                    "error": "Dataset is empty. CSV file must contain at least one data row and one column."
                }), 400
            
            # Build column information with statistics
            columns_info = []
            for column in df.columns:
                col_data = df[column]
                col_info = {
                    'name': column,
                    'null_count': int(col_data.isnull().sum()),
                    'unique_count': int(col_data.nunique())
                }
                
                # Check if already numeric
                if pd.api.types.is_numeric_dtype(col_data):
                    col_info['type'] = 'numeric'
                    col_info['min'] = float(col_data.min()) if not pd.isna(col_data.min()) else None
                    col_info['max'] = float(col_data.max()) if not pd.isna(col_data.max()) else None
                    col_info['mean'] = float(col_data.mean()) if not pd.isna(col_data.mean()) else None
                    col_info['std'] = float(col_data.std()) if not pd.isna(col_data.std()) else None
                elif pd.api.types.is_datetime64_any_dtype(col_data):
                    col_info['type'] = 'date'
                else:
                    # Try to convert object/string columns to numeric if they appear to be numeric
                    # This handles cases where CSV columns are read as strings but should be numeric
                    non_null_data = col_data.dropna()
                    if len(non_null_data) > 0:
                        # Try converting to numeric
                        numeric_converted = pd.to_numeric(non_null_data, errors='coerce')
                        # Count how many successfully converted
                        successful_conversions = numeric_converted.notna().sum()
                        conversion_rate = successful_conversions / len(non_null_data)
                        
                        # If >80% of non-null values can be converted to numeric, treat as numeric
                        if conversion_rate > 0.8:
                            # Convert the whole column to numeric for statistics
                            col_data_numeric = pd.to_numeric(col_data, errors='coerce')
                            col_info['type'] = 'numeric'
                            col_info['min'] = float(col_data_numeric.min()) if not pd.isna(col_data_numeric.min()) else None
                            col_info['max'] = float(col_data_numeric.max()) if not pd.isna(col_data_numeric.max()) else None
                            col_info['mean'] = float(col_data_numeric.mean()) if not pd.isna(col_data_numeric.mean()) else None
                            col_info['std'] = float(col_data_numeric.std()) if not pd.isna(col_data_numeric.std()) else None
                        else:
                            col_info['type'] = 'categorical'
                            unique_vals = non_null_data.unique()
                            if len(unique_vals) <= 20:
                                col_info['unique_values'] = [str(v) for v in unique_vals]
                    else:
                        # All nulls - default to categorical
                        col_info['type'] = 'categorical'
                
                columns_info.append(col_info)
            
            # Summary statistics - safe calculation to prevent ZeroDivisionError
            num_rows = len(df)
            num_cols = len(df.columns)
            
            # Calculate total cells safely
            if num_rows > 0 and num_cols > 0:
                total_cells = num_rows * num_cols
            else:
                # This should not happen due to validation above, but defensive programming
                total_cells = 1
            
            missing_cells = int(df.isnull().sum().sum())
            # Safe division - total_cells should never be 0 at this point, but check anyway
            missing_percentage = float((missing_cells / total_cells) * 100) if total_cells > 0 else 0.0
            
            summary = {
                'total_rows': len(df),
                'total_columns': len(df.columns),
                'numeric_columns': sum(1 for c in columns_info if c['type'] == 'numeric'),
                'categorical_columns': sum(1 for c in columns_info if c['type'] == 'categorical'),
                'missing_cells': missing_cells,
                'missing_percentage': missing_percentage
            }
            
            # Preview rows (first 100)
            preview_rows = df.head(100).fillna('').to_dict('records')
            
            # Use sanitize_for_json to handle any remaining NaNs or Infs
            response = {
                "dataset_id": dataset_id,
                "columns": columns_info,
                "summary": summary,
                "rows": preview_rows
            }
            return jsonify(sanitize_for_json(response)), 200
            
        finally:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
                
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to get preview: {str(e)}"}), 500


@datasets_bp.route('/<int:dataset_id>/analyze/did', methods=['POST'])
@jwt_required()
def run_did_analysis(dataset_id):
    """Run Difference-in-Differences analysis on a dataset."""
    print("=== DiD ANALYSIS STARTED ===")
    try:
        current_user_id = get_jwt_identity()
        if not isinstance(current_user_id, str):
            raise ValueError("Invalid token identity")
        
        # Get dataset
        dataset = Dataset.query.get(dataset_id)
        if not dataset:
            return jsonify({"error": f"Dataset {dataset_id} not found"}), 404
        
        # Check if user has access to this dataset
        has_access = False
        if str(dataset.user_id) == str(current_user_id):
            has_access = True
        elif dataset.project and str(dataset.project.user_id) == str(current_user_id):
            has_access = True
        
        if not has_access:
            return jsonify({"error": "Access denied"}), 403
        
        # Get analysis parameters from request
        data = request.get_json()
        if not data:
            return jsonify({"error": "No analysis parameters provided"}), 400
        
        # Extract parameters
        outcome_var = data.get('outcome')
        treatment_var = data.get('treatment')
        treatment_value = data.get('treatment_value')
        time_var = data.get('time')
        treatment_start = data.get('treatment_start')
        start_period = data.get('start_period')
        end_period = data.get('end_period')
        unit_var = data.get('unit')
        control_vars = data.get('controls', [])
        treatment_units = data.get('treatment_units', [])
        control_units = data.get('control_units', [])
        
        print("Received parameters:")
        print(f"  treatment_units: {treatment_units}")
        print(f"  control_units: {control_units}")
        print(f"  unit_var: {unit_var}")
        print(f"  treatment_var: {treatment_var}")
        print(f"  treatment_value: {treatment_value}")
        print(f"  start_period: {start_period}")
        print(f"  end_period: {end_period}")
        print(f"  treatment_start: {treatment_start}")
        
        # Validate required parameters
        required_params = [
            outcome_var, treatment_var, treatment_value, 
            time_var, treatment_start, start_period, end_period, unit_var,
            treatment_units, control_units
        ]
        if not all(required_params):
            return jsonify({
                "error": "Missing required analysis parameters"
            }), 400
        
        # Download file from S3 to perform analysis
        s3_client = boto3.client(
            's3',
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
            region_name=AWS_REGION
        )
        
        temp_file_path = f"/tmp/did_analysis_{dataset_id}.csv"
        
        try:
            # Download file from S3
            s3_client.download_file(S3_BUCKET_NAME, dataset.s3_key, temp_file_path)
            
            # Read CSV and perform DiD analysis
            df = pd.read_csv(temp_file_path)
            
            # Convert outcome variable to numeric (handle large numbers stored as strings)
            if outcome_var in df.columns:
                df[outcome_var] = pd.to_numeric(df[outcome_var], errors='coerce')
                # Check for any NaN values created during conversion
                nan_count = df[outcome_var].isna().sum()
                if nan_count > 0:
                    print(f"Warning: {nan_count} non-numeric values in outcome variable were converted to NaN")
            
            # Apply treatment and control unit filtering
            print(f"Treatment units: {treatment_units}")
            print(f"Control units: {control_units}")
            print(f"Unit variable: {unit_var}")
            if treatment_units and control_units:
                print("Using unit-based treatment assignment")
                # Filter data to only include selected treatment and control units
                df = df[df[unit_var].isin(treatment_units + control_units)]
                print(f"Data shape after unit filtering: {df.shape}")
                
                # Create treatment indicator based on selected units
                df['is_treated'] = df[unit_var].isin(treatment_units).astype(int)
                print(f"Treatment assignment - treated units: {df['is_treated'].sum()}")
            else:
                print("Using fallback treatment variable logic")
                # Fallback to original treatment variable logic if units not specified
                df['is_treated'] = (df[treatment_var] == treatment_value).astype(int)
            
            # Convert treatment start to appropriate type
            if pd.api.types.is_numeric_dtype(df[time_var]):
                treatment_start = float(treatment_start)
            else:
                treatment_start = str(treatment_start)
            
            # Note: treatment_value conversion removed since we're using unit-based assignment
            
            # Create post-treatment indicator
            df['post_treatment'] = (df[time_var] >= treatment_start).astype(int)
            df['did_interaction'] = df['is_treated'] * df['post_treatment']
            
            # Debug information
            print(f"Dataset shape: {df.shape}")
            print(f"Unit-based assignment - Treatment units: {treatment_units}, Control units: {control_units}")
            print(f"Treated units: {df['is_treated'].sum()}")
            print(f"Post-treatment observations: {df['post_treatment'].sum()}")
            
            # Check if we have enough data
            if df['is_treated'].sum() == 0:
                return jsonify({"error": "No treated units found in the selected treatment group"}), 400
            
            if df['post_treatment'].sum() == 0:
                return jsonify({"error": "No post-treatment observations found"}), 400
            
            # Test parallel trends using improved function
            # This uses joint F-test and event study analysis
            parallel_trends_result = None
            try:
                # Normalize treatment_time to match time column dtype exactly using pandas
                if pd.api.types.is_datetime64_any_dtype(df[time_var]):
                    treatment_time_for_test = pd.to_datetime(treatment_start)
                elif pd.api.types.is_numeric_dtype(df[time_var]):
                    treatment_time_for_test = pd.to_numeric(treatment_start, errors='coerce')
                    if pd.isna(treatment_time_for_test):
                        raise ValueError(f"Could not convert treatment_start {treatment_start} to numeric to match time column type")
                else:
                    treatment_time_for_test = str(treatment_start)
                
                # Get unit column if available
                unit_var = request.json.get('unit') if request.json else None
                
                print(f"Running parallel trends check:")
                print(f"  - treatment_col: is_treated")
                print(f"  - time_col: {time_var}")
                print(f"  - outcome_col: {outcome_var}")
                print(f"  - unit_col: {unit_var}")
                print(f"  - treatment_time: {treatment_time_for_test} (type: {type(treatment_time_for_test)})")
                print(f"  - Data shape: {df.shape}")
                print(f"  - Time column dtype: {df[time_var].dtype}")
                if unit_var and unit_var in df.columns:
                    print(f"  - Unit column dtype: {df[unit_var].dtype}")
                    print(f"  - Unique units: {df[unit_var].nunique()}")
                print(f"  - Pre-treatment periods: {sorted(df[df[time_var] < treatment_time_for_test][time_var].unique())}")
                
                # Use the improved check_parallel_trends function
                # It expects: df, treatment_col, time_col, outcome_col, treatment_time, unit_col
                print(f"  Calling check_parallel_trends function...")
                import sys
                sys.stdout.flush()
                sys.stderr.flush()
                
                try:
                    parallel_trends_result = check_parallel_trends(
                        df=df,
                        treatment_col='is_treated',
                        time_col=time_var,
                        outcome_col=outcome_var,
                        treatment_time=treatment_time_for_test,
                        unit_col=unit_var if unit_var and unit_var in df.columns else None
                    )
                    print(f"  check_parallel_trends returned successfully")
                    sys.stdout.flush()
                except Exception as e:
                    print(f"  EXCEPTION in check_parallel_trends: {str(e)}")
                    import traceback
                    traceback.print_exc()
                    sys.stdout.flush()
                    raise
                
                print(f"Parallel trends check completed.")
                sys.stdout.flush()
                print(f"  - Confidence: {parallel_trends_result.get('confidence_level', 'unknown')}")
                print(f"  - P-value: {parallel_trends_result.get('p_value', 'None')}")
                print(f"  - Message: {parallel_trends_result.get('message', 'None')}")
                print(f"  - Has mean_chart: {parallel_trends_result.get('mean_chart') is not None}")
                print(f"  - Has event_study_chart: {parallel_trends_result.get('event_study_chart') is not None}")
                event_coeffs = parallel_trends_result.get('event_study_coefficients', [])
                print(f"  - Event study coefficients: {len(event_coeffs)} coefficients")
                print(f"  - Warnings: {parallel_trends_result.get('warnings', [])}")
                sys.stdout.flush()
                
                # Add warning to results if event study failed
                if not event_coeffs and parallel_trends_result.get('warnings'):
                    event_warnings = [w for w in parallel_trends_result.get('warnings', []) if 'event study' in w.lower()]
                    if event_warnings:
                        print(f"  - Event study warning: {event_warnings[0]}")
                        sys.stdout.flush()
            except Exception as e:
                print(f"Error in parallel trends test: {str(e)}")
                import traceback
                traceback.print_exc()
                # Continue without parallel trends test if it fails
                parallel_trends_result = {
                    "passed": None,
                    "p_value": None,
                    "message": f"Could not perform parallel trends test: {str(e)}",
                    "confidence_level": "unknown",
                    "visual_chart": None,
                    "event_study_chart": None,
                    "warnings": [f"Error: {str(e)}"]
                }
            
            # For backward compatibility, also create parallel_trends_test
            # but prefer the new parallel_trends structure
            parallel_trends_test = None
            if parallel_trends_result:
                # Create backward-compatible structure
                parallel_trends_test = {
                    'passed': parallel_trends_result.get('passed'),
                    'p_value': parallel_trends_result.get('p_value'),
                    'visual_chart': parallel_trends_result.get('visual_chart')
                }
            
            # Prepare data for analysis
            analysis_cols = [
                outcome_var, 'is_treated', 'post_treatment', 
                'did_interaction', unit_var, time_var
            ] + control_vars
            analysis_data = df[analysis_cols].copy()
            analysis_data = analysis_data.dropna()
            
            # Ensure outcome variable is numeric for statistics calculation
            if outcome_var in analysis_data.columns:
                analysis_data[outcome_var] = pd.to_numeric(analysis_data[outcome_var], errors='coerce')
            
            # Basic statistics
            basic_stats = {
                'total_observations': int(len(analysis_data)),
                'treated_units': int(analysis_data['is_treated'].sum()),
                'control_units': int(len(analysis_data) - analysis_data['is_treated'].sum()),
                'pre_treatment_obs': int((analysis_data['post_treatment'] == 0).sum()),
                'post_treatment_obs': int((analysis_data['post_treatment'] == 1).sum()),
                'outcome_mean_treated_pre': float(
                    analysis_data[(analysis_data['is_treated'] == 1) & (analysis_data['post_treatment'] == 0)][outcome_var].mean()
                ) if len(analysis_data[(analysis_data['is_treated'] == 1) & (analysis_data['post_treatment'] == 0)]) > 0 else 0.0,
                'outcome_mean_treated_post': float(
                    analysis_data[(analysis_data['is_treated'] == 1) & (analysis_data['post_treatment'] == 1)][outcome_var].mean()
                ) if len(analysis_data[(analysis_data['is_treated'] == 1) & (analysis_data['post_treatment'] == 1)]) > 0 else 0.0,
                'outcome_mean_control_pre': float(
                    analysis_data[(analysis_data['is_treated'] == 0) & (analysis_data['post_treatment'] == 0)][outcome_var].mean()
                ) if len(analysis_data[(analysis_data['is_treated'] == 0) & (analysis_data['post_treatment'] == 0)]) > 0 else 0.0,
                'outcome_mean_control_post': float(
                    analysis_data[(analysis_data['is_treated'] == 0) & (analysis_data['post_treatment'] == 1)][outcome_var].mean()
                ) if len(analysis_data[(analysis_data['is_treated'] == 0) & (analysis_data['post_treatment'] == 1)]) > 0 else 0.0
            }
            
            # Calculate period-by-period statistics for detailed breakdown
            # Using proper DiD event study methodology:
            # - Counterfactual_t = Y_treated_pre + (Y_control_t - Y_control_pre)
            # - Effect_t = Y_treated_t - Counterfactual_t
            # - Treatment start year is marked as transition (partial effect)
            
            period_statistics = []
            all_periods = sorted(analysis_data[time_var].unique())
            
            # Get pre-treatment baseline means
            pre_treatment_mean_treated = basic_stats['outcome_mean_treated_pre']
            pre_treatment_mean_control = basic_stats['outcome_mean_control_pre']
            
            print(f"Period stats - Pre-treatment baselines: treated={pre_treatment_mean_treated:.4f}, control={pre_treatment_mean_control:.4f}")
            print(f"Period stats - Treatment start: {treatment_start}")
            
            try:
                for period in all_periods:
                    period_data = analysis_data[analysis_data[time_var] == period]
                    
                    # Calculate group means for this period
                    treated_data = period_data[period_data['is_treated'] == 1][outcome_var]
                    control_data = period_data[period_data['is_treated'] == 0][outcome_var]
                    
                    treated_mean = treated_data.mean() if len(treated_data) > 0 else np.nan
                    control_mean = control_data.mean() if len(control_data) > 0 else np.nan
                    
                    # Determine period type
                    is_post = bool(period_data['post_treatment'].iloc[0] == 1) if len(period_data) > 0 else False
                    
                    # Compare as floats to handle type mismatches (period might be int, treatment_start might be float)
                    try:
                        is_treatment_start_year = (float(period) == float(treatment_start))
                    except (ValueError, TypeError):
                        is_treatment_start_year = (str(period) == str(treatment_start))
                    
                    # Calculate counterfactual using parallel trends assumption:
                    # "What would treatment group be at time t if it followed control's trajectory?"
                    # Counterfactual_t = Treatment_pre_mean + (Control_t - Control_pre_mean)
                    control_change_from_baseline = control_mean - pre_treatment_mean_control if not pd.isna(control_mean) else 0
                    counterfactual_treated = pre_treatment_mean_treated + control_change_from_baseline
                    
                    # Calculate period-specific causal effect
                    # Effect_t = Actual_treatment_t - Counterfactual_t
                    # Only calculate for post-treatment periods, excluding treatment start year
                    if is_post and not is_treatment_start_year and not pd.isna(treated_mean) and not pd.isna(counterfactual_treated):
                        period_effect = treated_mean - counterfactual_treated
                    elif is_treatment_start_year:
                        # Treatment year is a transition - effect may be partial
                        period_effect = None  # Mark as transition, don't calculate
                    else:
                        period_effect = None
                    
                    # Format period value for JSON
                    if pd.api.types.is_numeric_dtype(analysis_data[time_var]):
                        period_val = int(period) if float(period).is_integer() else float(period)
                    else:
                        period_val = str(period)
                    
                    period_statistics.append({
                        'period': period_val,
                        'treatment_mean': float(treated_mean) if not pd.isna(treated_mean) else None,
                        'control_mean': float(control_mean) if not pd.isna(control_mean) else None,
                        'is_post_treatment': is_post,
                        'is_treatment_start': is_treatment_start_year,
                        'period_effect': float(period_effect) if period_effect is not None else None,
                        'counterfactual': float(counterfactual_treated) if is_post and not pd.isna(counterfactual_treated) else None
                    })
                
                print(f"Generated {len(period_statistics)} period statistics")
            except Exception as e:
                print(f"Error generating period statistics: {str(e)}")
                import traceback
                traceback.print_exc()
                # Continue with empty period statistics if there's an error
                period_statistics = []
            
            # Calculate simple DiD estimate
            treated_diff = basic_stats['outcome_mean_treated_post'] - basic_stats['outcome_mean_treated_pre']
            control_diff = basic_stats['outcome_mean_control_post'] - basic_stats['outcome_mean_control_pre']
            did_estimate = treated_diff - control_diff
            print(f"DiD calculation: treated_diff={treated_diff}, control_diff={control_diff}, did_estimate={did_estimate}")
            
            # Calculate clustered standard errors at the unit level
            # This accounts for correlation within units over time
            epsilon = 1e-10
            
            # Calculate unit-level means for each group-period combination
            unit_means = analysis_data.groupby([unit_var, 'is_treated', 'post_treatment'])[outcome_var].mean().reset_index()
            
            # Calculate DiD at unit level
            treated_units_list = analysis_data[analysis_data['is_treated'] == 1][unit_var].unique()
            control_units_list = analysis_data[analysis_data['is_treated'] == 0][unit_var].unique()
            
            # Calculate unit-level differences
            unit_diffs_treated = []
            for unit in treated_units_list:
                unit_data = unit_means[unit_means[unit_var] == unit]
                pre = unit_data[unit_data['post_treatment'] == 0][outcome_var].values
                post = unit_data[unit_data['post_treatment'] == 1][outcome_var].values
                if len(pre) > 0 and len(post) > 0:
                    unit_diffs_treated.append(post[0] - pre[0])
            
            unit_diffs_control = []
            for unit in control_units_list:
                unit_data = unit_means[unit_means[unit_var] == unit]
                pre = unit_data[unit_data['post_treatment'] == 0][outcome_var].values
                post = unit_data[unit_data['post_treatment'] == 1][outcome_var].values
                if len(pre) > 0 and len(post) > 0:
                    unit_diffs_control.append(post[0] - pre[0])
            
            # Calculate standard errors using unit-level variance
            if len(unit_diffs_treated) > 1 and len(unit_diffs_control) > 1:
                var_treated = np.var(unit_diffs_treated, ddof=1)
                var_control = np.var(unit_diffs_control, ddof=1)
                se_did = np.sqrt(var_treated / len(unit_diffs_treated) + var_control / len(unit_diffs_control))
            else:
                # Fallback to simple calculation if not enough units
                treated_pre_data = analysis_data[(analysis_data['is_treated'] == 1) & (analysis_data['post_treatment'] == 0)][outcome_var]
                treated_post_data = analysis_data[(analysis_data['is_treated'] == 1) & (analysis_data['post_treatment'] == 1)][outcome_var]
                control_pre_data = analysis_data[(analysis_data['is_treated'] == 0) & (analysis_data['post_treatment'] == 0)][outcome_var]
                control_post_data = analysis_data[(analysis_data['is_treated'] == 0) & (analysis_data['post_treatment'] == 1)][outcome_var]
                
                treated_var = (treated_pre_data.var() + treated_post_data.var()) if len(treated_pre_data) > 1 else 0.0
                control_var = (control_pre_data.var() + control_post_data.var()) if len(control_pre_data) > 1 else 0.0
                
                n_treated = max(len(treated_pre_data), 1)
                n_control = max(len(control_pre_data), 1)
                
                se_did = np.sqrt(treated_var / n_treated + control_var / n_control)
            
            # Ensure standard error is not zero
            se_did = max(se_did, epsilon)
            
            # Calculate confidence interval (95%)
            confidence_interval = {
                'lower': did_estimate - 1.96 * se_did,
                'upper': did_estimate + 1.96 * se_did
            }
            
            # Generate chart
            chart_base64 = None
            chart_data = None
            print("Starting chart generation...")
            try:
                chart_result = create_did_chart(
                    df, outcome_var, time_var, treatment_start, start_period, end_period, unit_var, treatment_units, control_units
                )
                if chart_result:
                    if isinstance(chart_result, dict):
                        chart_base64 = chart_result.get('png')
                        chart_data = chart_result.get('data')
                    else:
                        # Backward compatibility: if it's still a string, use it as PNG
                        chart_base64 = chart_result
                    
                    print(f"Chart generation result: PNG length: {len(chart_base64) if chart_base64 else 'None'}, Data: {bool(chart_data)}")
                    # Allow charts up to 200KB (base64 encoded) for high quality
                    if chart_base64 and len(chart_base64) > 200000:
                        print(f"Chart too large ({len(chart_base64)} chars), skipping chart")
                        chart_base64 = None
            except Exception as e:
                print(f"Error creating main chart: {str(e)}")
                import traceback
                traceback.print_exc()
                # Continue without chart if it fails
            
            # Generate pre-treatment trends chart for parallel trends test
            pretreatment_chart_base64 = None
            if parallel_trends_test:
                try:
                    pretreatment_chart_base64 = create_pretreatment_trends_chart(
                        df, outcome_var, time_var, treatment_var, 
                        treatment_value, start_period, treatment_start, unit_var, treatment_units, control_units
                    )
                    parallel_trends_test['visual_chart'] = pretreatment_chart_base64
                except Exception as e:
                    print(f"Error creating pre-treatment chart: {str(e)}")
                    # Continue without chart if it fails
            
            # Calculate z-statistic and p-value using proper normal distribution
            z_stat = abs(did_estimate / se_did) if se_did > epsilon else 0
            p_value = 2 * (1 - norm.cdf(z_stat)) if se_did > epsilon else 1.0
            
            # Results
            print(f"Creating results object with did_estimate: {did_estimate}, se_did: {se_did}, z_stat: {z_stat}, p_value: {p_value}")
            results = {
                'did_estimate': float(did_estimate),
                'standard_error': float(se_did),
                'confidence_interval': {
                    'lower': float(confidence_interval['lower']),
                    'upper': float(confidence_interval['upper'])
                },
                'p_value': float(p_value),
                'is_significant': bool(p_value < 0.05),
                'statistics': basic_stats,
                'period_statistics': period_statistics,
                'interpretation': {
                    'effect_size': float(abs(did_estimate)),
                    'effect_direction': 'positive' if did_estimate > 0 else 'negative',
                    'significance': 'significant' if p_value < 0.05 else 'not significant'
                },
                'chart': chart_base64 or '',
                'chart_data': chart_data,
                'parallel_trends_test': parallel_trends_test,  # Backward compatibility
                'parallel_trends': parallel_trends_result  # New improved structure
            }
            print(f"Results object created successfully with keys: {list(results.keys())}")
            
            # Debug: Try to serialize the results to catch any remaining issues
            try:
                import json
                json.dumps(results)
                print("Results serialization successful")
            except Exception as e:
                print(f"Serialization error: {str(e)}")
                # Try to identify the problematic field
                for key, value in results.items():
                    try:
                        json.dumps({key: value})
                    except Exception as field_error:
                        print(f"Problem with field '{key}': {str(field_error)}")
                        print(f"Value type: {type(value)}")
                        print(f"Value: {value}")
            
            response_data = {
                "analysis_type": "Difference-in-Differences",
                "dataset_id": dataset_id,
                "parameters": {
                    "outcome": outcome_var,
                    "treatment": treatment_var,
                    "treatment_value": treatment_value,
                    "time": time_var,
                    "treatment_start": treatment_start,
                    "start_period": start_period,
                    "end_period": end_period,
                    "unit": unit_var,
                    "controls": control_vars,
                    "treatment_units": treatment_units,
                    "control_units": control_units
                },
                "results": results
            }
            
            print("Response structure check:")
            print(f"  - Has analysis_type: {'analysis_type' in response_data}")
            print(f"  - Has dataset_id: {'dataset_id' in response_data}")
            print(f"  - Has parameters: {'parameters' in response_data}")
            print(f"  - Has results: {'results' in response_data}")
            print(f"  - Parameters keys: {list(response_data['parameters'].keys()) if 'parameters' in response_data else 'None'}")
            print(f"  - Results keys: {list(response_data['results'].keys()) if 'results' in response_data else 'None'}")
            
            # Sanitize response data to convert NaN/Inf to None
            response_data = sanitize_for_json(response_data)
            print("Response data sanitized for JSON")
            
            return jsonify(response_data), 200
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
        
    except ValueError:
        return jsonify({"error": "Invalid token identity"}), 401
    except Exception as e:
        print(f"ERROR in run_did_analysis: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "error": f"Failed to run DiD analysis: {str(e)}"
        }), 500
