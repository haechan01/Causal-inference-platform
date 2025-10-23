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
from scipy.stats import t
from models import Dataset

# Create blueprint
datasets_bp = Blueprint('datasets', __name__, url_prefix='/api/datasets')


def create_did_chart(df, outcome_var, time_var, treatment_var, treatment_value, 
                     treatment_start, start_period, end_period, unit_var):
    """Create a matplotlib chart for DiD analysis."""
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
            end_period = float(end_period)
        else:
            treatment_start = str(treatment_start)
            start_period = str(start_period)
            end_period = str(end_period)
        
        # Filter data to analysis period
        df_filtered = df[(df[time_var] >= start_period) & (df[time_var] <= end_period)].copy()
        
        # Create treatment indicator
        df_filtered['is_treated'] = (df_filtered[treatment_var] == treatment_value).astype(int)
        df_filtered['post_treatment'] = (df_filtered[time_var] >= treatment_start).astype(int)
        
        # Calculate means by group and time period
        time_series_data = df_filtered.groupby([time_var, 'is_treated'])[outcome_var].mean().reset_index()
        
        # Separate treated and control groups
        treated_data = time_series_data[time_series_data['is_treated'] == 1].sort_values(time_var)
        control_data = time_series_data[time_series_data['is_treated'] == 0].sort_values(time_var)
        
        # Create the chart
        plt.figure(figsize=(12, 8))
        
        # Plot time series lines
        if len(treated_data) > 0:
            plt.plot(treated_data[time_var], treated_data[outcome_var], 'o-', 
                    color='#4F9CF9', linewidth=2, label='Treatment Group', markersize=6)
        
        if len(control_data) > 0:
            plt.plot(control_data[time_var], control_data[outcome_var], 'o-', 
                    color='#FF6B6B', linewidth=2, label='Control Group', markersize=6)
        
        # Add counterfactual line (what would have happened to treatment group without treatment)
        if len(treated_data) > 0 and len(control_data) > 0:
            # Calculate counterfactual: control group trend applied to treatment group
            control_trend = np.polyfit(control_data[time_var], control_data[outcome_var], 1)
            counterfactual_values = np.polyval(control_trend, treated_data[time_var])
            plt.plot(treated_data[time_var], counterfactual_values, '--', 
                    color='#4F9CF9', linewidth=2, alpha=0.7, 
                    label='Counterfactual (No Treatment)')
        
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
        
        # Save to base64 string
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
        buffer.seek(0)
        chart_base64 = base64.b64encode(buffer.getvalue()).decode()
        plt.close()
        
        return chart_base64
        
    except Exception as e:
        print(f"Error creating chart: {str(e)}")
        return None


def create_pretreatment_trends_chart(df, outcome_var, time_var, treatment_var, 
                                     treatment_value, start_period, treatment_start, unit_var):
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
        
        # Create treatment indicator
        df_pre['is_treated'] = (df_pre[treatment_var] == treatment_value).astype(int)
        
        # Calculate means by group and time period
        time_series_data = df_pre.groupby([time_var, 'is_treated'])[outcome_var].mean().reset_index()
        
        # Separate treated and control groups
        treated_data = time_series_data[time_series_data['is_treated'] == 1].sort_values(time_var)
        control_data = time_series_data[time_series_data['is_treated'] == 0].sort_values(time_var)
        
        # Create the chart
        plt.figure(figsize=(10, 6))
        
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
        
        # Save to base64 string
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
        buffer.seek(0)
        chart_base64 = base64.b64encode(buffer.getvalue()).decode()
        plt.close()
        
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
        
        # Check if user has access to this dataset's project
        # Convert both to strings for comparison to handle type mismatches
        if str(dataset.project.user_id) != str(current_user_id):
            return jsonify({
                "error": "Access denied", 
                "details": (
                    f"Dataset {dataset_id} belongs to project {dataset.project_id} "
                    f"owned by user {dataset.project.user_id} "
                    f"(type: {type(dataset.project.user_id)}), "
                    f"but current user is {current_user_id} "
                    f"(type: {type(current_user_id)})"
                )
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
                    col_type = 'categorical'

                # Get unique values for categorical columns and binary numeric columns
                # (limit to 20 for performance)
                unique_values = None
                if col_type in ['categorical', 'boolean']:
                    unique_vals = col_data.dropna().unique()
                    if len(unique_vals) <= 20:
                        unique_values = [str(val) for val in unique_vals]
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


@datasets_bp.route('/<int:dataset_id>/analyze/did', methods=['POST'])
@jwt_required()
def run_did_analysis(dataset_id):
    """Run Difference-in-Differences analysis on a dataset."""
    try:
        current_user_id = get_jwt_identity()
        if not isinstance(current_user_id, str):
            raise ValueError("Invalid token identity")
        
        # Get dataset
        dataset = Dataset.query.get(dataset_id)
        if not dataset:
            return jsonify({"error": f"Dataset {dataset_id} not found"}), 404
        
        # Check if user has access to this dataset's project
        if str(dataset.project.user_id) != str(current_user_id):
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
        control_filters = data.get('control_filters', {})
        
        # Validate required parameters
        required_params = [
            outcome_var, treatment_var, treatment_value, 
            time_var, treatment_start, start_period, end_period, unit_var
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
            
            # Apply control group filters if specified
            if control_filters:
                for var, criteria in control_filters.items():
                    if var in df.columns:
                        if 'min' in criteria and criteria['min'] is not None:
                            df = df[df[var] >= criteria['min']]
                        if 'max' in criteria and criteria['max'] is not None:
                            df = df[df[var] <= criteria['max']]
                        if 'include' in criteria and criteria['include']:
                            df = df[df[var].isin(criteria['include'])]
            
            # Convert treatment start to appropriate type
            if pd.api.types.is_numeric_dtype(df[time_var]):
                treatment_start = float(treatment_start)
            else:
                treatment_start = str(treatment_start)
            
            # Convert treatment value to appropriate type
            print(f"Treatment variable type: {df[treatment_var].dtype}")
            print(f"Treatment value before conversion: {treatment_value}")
            print(f"Unique values in treatment variable: {df[treatment_var].unique()[:10]}")
            
            if pd.api.types.is_numeric_dtype(df[treatment_var]):
                try:
                    treatment_value = float(treatment_value)
                except (ValueError, TypeError):
                    # If conversion fails, try to match as string
                    treatment_value = str(treatment_value)
            else:
                treatment_value = str(treatment_value)
            
            print(f"Treatment value after conversion: {treatment_value}")
            
            # Create treatment indicator
            df['is_treated'] = (df[treatment_var] == treatment_value).astype(int)
            df['post_treatment'] = (df[time_var] >= treatment_start).astype(int)
            df['did_interaction'] = df['is_treated'] * df['post_treatment']
            
            # Debug information
            print(f"Dataset shape: {df.shape}")
            print(f"Treatment variable: {treatment_var}, Treatment value: {treatment_value}")
            print(f"Treated units: {df['is_treated'].sum()}")
            print(f"Post-treatment observations: {df['post_treatment'].sum()}")
            
            # Check if we have enough data
            if df['is_treated'].sum() == 0:
                return jsonify({"error": "No treated units found with the specified treatment value"}), 400
            
            if df['post_treatment'].sum() == 0:
                return jsonify({"error": "No post-treatment observations found"}), 400
            
            # Test parallel trends in pre-treatment period
            parallel_trends_test = None
            try:
                pre_treatment_data = df[df['post_treatment'] == 0].copy()
                
                if len(pre_treatment_data) > 0:
                    treated_pre = pre_treatment_data[pre_treatment_data['is_treated'] == 1]
                    control_pre = pre_treatment_data[pre_treatment_data['is_treated'] == 0]
                    
                    if len(treated_pre) > 2 and len(control_pre) > 2:
                        # Calculate trend slopes for each group
                        treated_trend = np.polyfit(treated_pre[time_var], treated_pre[outcome_var], 1)[0]
                        control_trend = np.polyfit(control_pre[time_var], control_pre[outcome_var], 1)[0]
                        
                        # Calculate standard errors and test difference
                        # Simple t-test for slope difference
                        treated_slope_se = np.std(treated_pre[outcome_var]) / np.sqrt(len(treated_pre))
                        control_slope_se = np.std(control_pre[outcome_var]) / np.sqrt(len(control_pre))
                        
                        # Pooled standard error
                        pooled_se = np.sqrt(treated_slope_se**2 + control_slope_se**2)
                        
                        # t-statistic and p-value
                        if pooled_se > 0:
                            t_stat = (treated_trend - control_trend) / pooled_se
                            p_value = 2 * (1 - t.cdf(abs(t_stat), len(treated_pre) + len(control_pre) - 2))
                        else:
                            p_value = 1.0  # If no variation, assume no difference
                        
                        parallel_trends_test = {
                            'treated_slope': float(treated_trend),
                            'control_slope': float(control_trend),
                            'p_value': float(p_value),
                            'passed': bool(p_value > 0.05),  # non-significant = parallel trends likely hold
                            'visual_chart': None  # Will be set later
                        }
            except Exception as e:
                print(f"Error in parallel trends test: {str(e)}")
                # Continue without parallel trends test if it fails
            
            # Prepare data for analysis
            analysis_cols = [
                outcome_var, 'is_treated', 'post_treatment', 
                'did_interaction', unit_var, time_var
            ] + control_vars
            analysis_data = df[analysis_cols].copy()
            analysis_data = analysis_data.dropna()
            
            # Basic statistics
            basic_stats = {
                'total_observations': int(len(analysis_data)),
                'treated_units': int(analysis_data['is_treated'].sum()),
                'control_units': int(len(analysis_data) - analysis_data['is_treated'].sum()),
                'pre_treatment_obs': int((analysis_data['post_treatment'] == 0).sum()),
                'post_treatment_obs': int((analysis_data['post_treatment'] == 1).sum()),
                'outcome_mean_treated_pre': float(
                    analysis_data[(analysis_data['is_treated'] == 1) & (analysis_data['post_treatment'] == 0)][outcome_var].mean()
                ),
                'outcome_mean_treated_post': float(
                    analysis_data[(analysis_data['is_treated'] == 1) & (analysis_data['post_treatment'] == 1)][outcome_var].mean()
                ),
                'outcome_mean_control_pre': float(
                    analysis_data[(analysis_data['is_treated'] == 0) & (analysis_data['post_treatment'] == 0)][outcome_var].mean()
                ),
                'outcome_mean_control_post': float(
                    analysis_data[(analysis_data['is_treated'] == 0) & (analysis_data['post_treatment'] == 1)][outcome_var].mean()
                )
            }
            
            # Calculate simple DiD estimate
            treated_diff = basic_stats['outcome_mean_treated_post'] - basic_stats['outcome_mean_treated_pre']
            control_diff = basic_stats['outcome_mean_control_post'] - basic_stats['outcome_mean_control_pre']
            did_estimate = treated_diff - control_diff
            
            # Calculate standard errors (simplified)
            # Add safety checks for variance calculations
            treated_pre_data = analysis_data[(analysis_data['is_treated'] == 1) & (analysis_data['post_treatment'] == 0)][outcome_var]
            treated_post_data = analysis_data[(analysis_data['is_treated'] == 1) & (analysis_data['post_treatment'] == 1)][outcome_var]
            control_pre_data = analysis_data[(analysis_data['is_treated'] == 0) & (analysis_data['post_treatment'] == 0)][outcome_var]
            control_post_data = analysis_data[(analysis_data['is_treated'] == 0) & (analysis_data['post_treatment'] == 1)][outcome_var]
            
            treated_pre_var = float(treated_pre_data.var()) if len(treated_pre_data) > 1 else 0.0
            treated_post_var = float(treated_post_data.var()) if len(treated_post_data) > 1 else 0.0
            control_pre_var = float(control_pre_data.var()) if len(control_pre_data) > 1 else 0.0
            control_post_var = float(control_post_data.var()) if len(control_post_data) > 1 else 0.0
            
            n_treated = int(analysis_data['is_treated'].sum())
            n_control = int(len(analysis_data) - n_treated)
            
            # Simplified standard error calculation
            # Add small epsilon to avoid division by zero
            epsilon = 1e-10
            se_did = (
                (treated_pre_var + treated_post_var) / max(n_treated, 1) + 
                (control_pre_var + control_post_var) / max(n_control, 1)
            ) ** 0.5
            
            # Ensure standard error is not zero
            se_did = max(se_did, epsilon)
            
            # Calculate confidence interval (95%)
            confidence_interval = {
                'lower': did_estimate - 1.96 * se_did,
                'upper': did_estimate + 1.96 * se_did
            }
            
            # Generate chart
            chart_base64 = None
            try:
                chart_base64 = create_did_chart(
                    df, outcome_var, time_var, treatment_var, 
                    treatment_value, treatment_start, start_period, end_period, unit_var
                )
            except Exception as e:
                print(f"Error creating main chart: {str(e)}")
                # Continue without chart if it fails
            
            # Generate pre-treatment trends chart for parallel trends test
            pretreatment_chart_base64 = None
            if parallel_trends_test:
                try:
                    pretreatment_chart_base64 = create_pretreatment_trends_chart(
                        df, outcome_var, time_var, treatment_var, 
                        treatment_value, start_period, treatment_start, unit_var
                    )
                    parallel_trends_test['visual_chart'] = pretreatment_chart_base64
                except Exception as e:
                    print(f"Error creating pre-treatment chart: {str(e)}")
                    # Continue without chart if it fails
            
            # Results
            results = {
                'did_estimate': float(did_estimate),
                'standard_error': float(se_did),
                'confidence_interval': {
                    'lower': float(confidence_interval['lower']),
                    'upper': float(confidence_interval['upper'])
                },
                'p_value': float(
                    2 * (1 - abs(did_estimate / se_did)) 
                    if se_did > epsilon else 1
                ),
                'is_significant': bool(
                    abs(did_estimate / se_did) > 1.96 
                    if se_did > epsilon else False
                ),
                'statistics': basic_stats,
                'interpretation': {
                    'effect_size': float(abs(did_estimate)),
                    'effect_direction': 'positive' if did_estimate > 0 else 'negative',
                    'significance': (
                        'significant' 
                        if abs(did_estimate / se_did) > 1.96 and se_did > epsilon
                        else 'not significant'
                    )
                },
                'chart': chart_base64,
                'parallel_trends_test': parallel_trends_test
            }
            
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
            
            return jsonify({
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
                    "controls": control_vars
                },
                "results": results
            }), 200
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
        
    except ValueError:
        return jsonify({"error": "Invalid token identity"}), 401
    except Exception as e:
        return jsonify({
            "error": f"Failed to run DiD analysis: {str(e)}"
        }), 500
