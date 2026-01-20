

@datasets_bp.route('/<int:dataset_id>/analyze/rd', methods=['POST'])
@jwt_required()
def run_rd_analysis(dataset_id):
    """Run Regression Discontinuity (RD) analysis on a dataset."""
    print("=== RD ANALYSIS STARTED ===")
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
        running_var = data.get('running_var')
        outcome_var = data.get('outcome_var')
        cutoff = data.get('cutoff')
        bandwidth = data.get('bandwidth')  # Optional
        polynomial_order = data.get('polynomial_order', 1)  # Default to 1
        
        print("Received RD parameters:")
        print(f"  running_var: {running_var}")
        print(f"  outcome_var: {outcome_var}")
        print(f"  cutoff: {cutoff}")
        print(f"  bandwidth: {bandwidth}")
        print(f"  polynomial_order: {polynomial_order}")
        
        # Validate required parameters
        if not running_var:
            return jsonify({"error": "Missing required parameter: running_var"}), 400
        if not outcome_var:
            return jsonify({"error": "Missing required parameter: outcome_var"}), 400
        if cutoff is None:
            return jsonify({"error": "Missing required parameter: cutoff"}), 400
        
        # Validate cutoff is numeric
        try:
            cutoff = float(cutoff)
        except (ValueError, TypeError):
            return jsonify({"error": "cutoff must be a number"}), 400
        
        # Validate bandwidth if provided
        if bandwidth is not None:
            try:
                bandwidth = float(bandwidth)
                if bandwidth <= 0:
                    return jsonify({"error": "bandwidth must be positive"}), 400
            except (ValueError, TypeError):
                return jsonify({"error": "bandwidth must be a number"}), 400
        
        # Validate polynomial_order
        try:
            polynomial_order = int(polynomial_order)
            if polynomial_order not in [1, 2]:
                return jsonify({
                    "error": "polynomial_order must be 1 or 2"
                }), 400
        except (ValueError, TypeError):
            return jsonify({"error": "polynomial_order must be an integer"}), 400
        
        # Download file from S3 to perform analysis
        s3_client = boto3.client(
            's3',
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
            region_name=AWS_REGION
        )
        
        temp_file_path = f"/tmp/rd_analysis_{dataset_id}.csv"
        
        try:
            # Download file from S3
            s3_client.download_file(
                S3_BUCKET_NAME, dataset.s3_key, temp_file_path
            )
            
            # Read CSV
            df = pd.read_csv(temp_file_path)
            
            print(f"Dataset shape: {df.shape}")
            print(f"Columns: {list(df.columns)}")
            
            # Validate columns exist
            if running_var not in df.columns:
                return jsonify({
                    "error": f"running_var '{running_var}' not found in dataset"
                }), 400
            if outcome_var not in df.columns:
                return jsonify({
                    "error": f"outcome_var '{outcome_var}' not found in dataset"
                }), 400
            
            # Create RD estimator
            rd = RDEstimator(
                data=df,
                running_var=running_var,
                outcome_var=outcome_var,
                cutoff=cutoff
            )
            
            # If bandwidth not provided, calculate optimal bandwidth
            if bandwidth is None:
                print("Calculating optimal bandwidth...")
                try:
                    bw_result = rd.calculate_optimal_bandwidth()
                    bandwidth = bw_result['bandwidth']
                    bandwidth_info = {
                        'optimal_bandwidth': bandwidth,
                        'bandwidth_method': bw_result.get('method'),
                        'bandwidth_diagnostics': bw_result.get('diagnostics'),
                        'bandwidth_warnings': bw_result.get('warnings', [])
                    }
                    print(f"  Optimal bandwidth: {bandwidth}")
                except Exception as bw_error:
                    print(f"  Failed to calculate optimal bandwidth: {bw_error}")
                    return jsonify({
                        "error": (
                            f"Failed to calculate optimal bandwidth: {str(bw_error)}. "
                            "Please specify bandwidth manually."
                        )
                    }), 400
            else:
                bandwidth_info = {
                    'optimal_bandwidth': None,
                    'bandwidth_method': 'user_specified',
                    'bandwidth_diagnostics': {},
                    'bandwidth_warnings': []
                }
            
            # Run RD estimation
            print(f"Running RD estimation with bandwidth={bandwidth}...")
            try:
                result = rd.estimate(
                    bandwidth=bandwidth, polynomial_order=polynomial_order
                )
                print("  RD estimation completed successfully")
            except Exception as est_error:
                print(f"  RD estimation failed: {est_error}")
                return jsonify({
                    "error": f"RD estimation failed: {str(est_error)}"
                }), 400
            
            # Build response
            response_data = {
                'analysis_type': 'regression_discontinuity',
                'dataset_id': dataset_id,
                'parameters': {
                    'running_var': running_var,
                    'outcome_var': outcome_var,
                    'cutoff': cutoff,
                    'bandwidth_used': bandwidth,
                    'polynomial_order': polynomial_order,
                },
                'results': {
                    'treatment_effect': result['treatment_effect'],
                    'se': result['se'],
                    'ci_lower': result['ci_lower'],
                    'ci_upper': result['ci_upper'],
                    'p_value': result['p_value'],
                    'is_significant': result['p_value'] < 0.05,
                    'n_treated': result['n_treated'],
                    'n_control': result['n_control'],
                    'n_total': result['n_total'],
                    'bandwidth_used': result['bandwidth_used'],
                    'polynomial_order': result['polynomial_order'],
                    'kernel': result['kernel'],
                    'warnings': result.get('warnings', []),
                    'diagnostics': result.get('diagnostics', {}),
                },
                'bandwidth_info': bandwidth_info
            }
            
            print("Response structure check:")
            print(f"  - Has analysis_type: {'analysis_type' in response_data}")
            print(f"  - Has dataset_id: {'dataset_id' in response_data}")
            print(f"  - Has parameters: {'parameters' in response_data}")
            print(f"  - Has results: {'results' in response_data}")
            
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
        print(f"ERROR in run_rd_analysis: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "error": f"Failed to run RD analysis: {str(e)}"
        }), 500


@datasets_bp.route('/<int:dataset_id>/analyze/rd/sensitivity', methods=['POST'])
@jwt_required()
def run_rd_sensitivity_analysis(dataset_id):
    """Run RD sensitivity analysis across bandwidth grid."""
    print("=== RD SENSITIVITY ANALYSIS STARTED ===")
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
        running_var = data.get('running_var')
        outcome_var = data.get('outcome_var')
        cutoff = data.get('cutoff')
        n_bandwidths = data.get('n_bandwidths', 20)  # Default to 20
        
        print("Received RD sensitivity parameters:")
        print(f"  running_var: {running_var}")
        print(f"  outcome_var: {outcome_var}")
        print(f"  cutoff: {cutoff}")
        print(f"  n_bandwidths: {n_bandwidths}")
        
        # Validate required parameters
        if not running_var:
            return jsonify({"error": "Missing required parameter: running_var"}), 400
        if not outcome_var:
            return jsonify({"error": "Missing required parameter: outcome_var"}), 400
        if cutoff is None:
            return jsonify({"error": "Missing required parameter: cutoff"}), 400
        
        # Validate cutoff is numeric
        try:
            cutoff = float(cutoff)
        except (ValueError, TypeError):
            return jsonify({"error": "cutoff must be a number"}), 400
        
        # Validate n_bandwidths
        try:
            n_bandwidths = int(n_bandwidths)
            if n_bandwidths < 5:
                n_bandwidths = 5
            elif n_bandwidths > 50:
                n_bandwidths = 50
        except (ValueError, TypeError):
            n_bandwidths = 20
        
        # Download file from S3
        s3_client = boto3.client(
            's3',
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
            region_name=AWS_REGION
        )
        
        temp_file_path = f"/tmp/rd_sensitivity_{dataset_id}.csv"
        
        try:
            # Download file from S3
            s3_client.download_file(
                S3_BUCKET_NAME, dataset.s3_key, temp_file_path
            )
            
            # Read CSV
            df = pd.read_csv(temp_file_path)
            
            print(f"Dataset shape: {df.shape}")
            
            # Validate columns exist
            if running_var not in df.columns:
                return jsonify({
                    "error": f"running_var '{running_var}' not found in dataset"
                }), 400
            if outcome_var not in df.columns:
                return jsonify({
                    "error": f"outcome_var '{outcome_var}' not found in dataset"
                }), 400
            
            # Create RD estimator
            rd = RDEstimator(
                data=df,
                running_var=running_var,
                outcome_var=outcome_var,
                cutoff=cutoff
            )
            
            # Run sensitivity analysis
            print(f"Running RD sensitivity analysis with {n_bandwidths} bandwidths...")
            try:
                result = rd.sensitivity_analysis(n_bandwidths=n_bandwidths)
                print("  Sensitivity analysis completed successfully")
            except Exception as sens_error:
                print(f"  Sensitivity analysis failed: {sens_error}")
                return jsonify({
                    "error": f"Sensitivity analysis failed: {str(sens_error)}"
                }), 400
            
            # Build response
            response_data = {
                'analysis_type': 'rd_sensitivity',
                'dataset_id': dataset_id,
                'parameters': {
                    'running_var': running_var,
                    'outcome_var': outcome_var,
                    'cutoff': cutoff,
                    'n_bandwidths': n_bandwidths,
                },
                'results': result['results'],
                'optimal_bandwidth': result['optimal_bandwidth'],
                'stability_coefficient': result['stability_coefficient'],
                'interpretation': result['interpretation'],
                'bandwidth_method': result.get('bandwidth_method'),
                'bandwidth_warnings': result.get('bandwidth_warnings', [])
            }
            
            print("Sensitivity response structure check:")
            print(f"  - Number of results: {len(result['results'])}")
            print(f"  - Optimal bandwidth: {result['optimal_bandwidth']}")
            print(f"  - Stability: {result['interpretation']['stability']}")
            
            # Sanitize response data
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
        print(f"ERROR in run_rd_sensitivity_analysis: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "error": f"Failed to run RD sensitivity analysis: {str(e)}"
        }), 500

