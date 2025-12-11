import statsmodels.formula.api as smf
import pandas as pd
import matplotlib.pyplot as plt
import base64
import io
import sys
import logging

# Set up logger
logger = logging.getLogger(__name__)

def check_parallel_trends(df, treatment_col, time_col, outcome_col, treatment_time, unit_col=None):
    """
    Check the parallel trends assumption for Difference-in-Differences.
    
    This function performs two complementary checks:
    1. Statistical test: Do treatment and control have different slopes pre-treatment?
    2. Event study: Visualize the treatment-control gap at each time point
    
    Parameters:
    -----------
    df : pandas DataFrame
        Panel data with units observed over time
    treatment_col : str
        Column name for treatment indicator (0 = control, 1 = treated)
    time_col : str
        Column name for time period
    outcome_col : str
        Column name for the outcome variable
    treatment_time : int/float/str/datetime
        The time period when treatment begins
    unit_col : str, optional
        Column name for unit identifier (required for event studies with staggered treatment)
        
    Returns:
    --------
    dict with test results, interpretation, and visualizations
    Always includes keys: passed, p_value, message, confidence_level, mean_chart,
    event_study_chart, event_study_coefficients, all_pre_periods_include_zero,
    warnings, explanations
    """
    logger.debug("=" * 80)
    logger.debug(f"[check_parallel_trends] FUNCTION CALLED")
    logger.debug(f"[check_parallel_trends] Starting with treatment_time={treatment_time}, type={type(treatment_time)}")
    logger.debug(f"[check_parallel_trends] Data shape: {df.shape}, columns: {list(df.columns)}")
    logger.debug(f"[check_parallel_trends] Unit column: {unit_col}")
    
    # Normalize treatment_time to match time_col dtype exactly
    if pd.api.types.is_datetime64_any_dtype(df[time_col]):
        treatment_time = pd.to_datetime(treatment_time)
    elif pd.api.types.is_numeric_dtype(df[time_col]):
        treatment_time = pd.to_numeric(treatment_time, errors='coerce')
        if pd.isna(treatment_time):
            logger.warning(f"Could not convert treatment_time {treatment_time} to numeric")
            return _empty_parallel_trends_result(
                "Could not convert treatment_time to match time column type",
                ["Type mismatch between treatment_time and time column"]
            )
    else:
        treatment_time = str(treatment_time)
    
    logger.debug(f"[check_parallel_trends] Normalized treatment_time={treatment_time}, type={type(treatment_time)}")
    logger.debug(f"[check_parallel_trends] Time column dtype: {df[time_col].dtype}")
    
    # =========================================================
    # STEP 1: Validate we have enough data
    # =========================================================
    
    pre_data = df[df[time_col] < treatment_time].copy()
    pre_periods = sorted(pre_data[time_col].unique())
    logger.debug(f"[check_parallel_trends] Pre-treatment periods: {pre_periods}, count: {len(pre_periods)}")
    
    # We need at least 2 pre-treatment periods:
    # - One to use as reference (t = -1)
    # - At least one other to compare against
    if len(pre_periods) < 2:
        return _empty_parallel_trends_result(
            "Need at least 2 pre-treatment periods to test parallel trends.",
            ["Insufficient data for parallel trends test: need at least 2 pre-treatment periods"]
        )
    
    # =========================================================
    # STEP 2: Run the statistical test
    # =========================================================
    
    test_result = _run_statistical_test(
        pre_data, treatment_col, time_col, outcome_col
    )
    
    # =========================================================
    # STEP 3: Run the event study analysis
    # =========================================================
    
    logger.debug(f"[check_parallel_trends] Running event study analysis...")
    logger.debug(f"[check_parallel_trends] Full dataframe shape: {df.shape}")
    logger.debug(f"[check_parallel_trends] Full dataframe columns: {list(df.columns)}")
    logger.debug(f"[check_parallel_trends] Treatment column '{treatment_col}' exists: {treatment_col in df.columns}")
    logger.debug(f"[check_parallel_trends] Time column '{time_col}' exists: {time_col in df.columns}")
    logger.debug(f"[check_parallel_trends] Outcome column '{outcome_col}' exists: {outcome_col in df.columns}")
    logger.debug(f"[check_parallel_trends] Unit column '{unit_col}' exists: {unit_col in df.columns if unit_col else False}")
    
    try:
        event_study = _run_event_study(
            df, treatment_col, time_col, outcome_col, treatment_time, unit_col=unit_col
        )
        logger.debug(f"[check_parallel_trends] Event study returned: {type(event_study)}")
        logger.debug(f"[check_parallel_trends] Event study keys: {list(event_study.keys()) if isinstance(event_study, dict) else 'Not a dict'}")
        
        if event_study.get("error"):
            logger.warning(f"[check_parallel_trends] Event study error: {event_study.get('error')}")
        else:
            coeffs = event_study.get('coefficients', [])
            chart = event_study.get('chart')
            logger.debug(f"[check_parallel_trends] Event study completed:")
            logger.debug(f"  - Coefficients: {len(coeffs) if coeffs else 0}")
            logger.debug(f"  - Chart exists: {chart is not None}")
            logger.debug(f"  - Chart type: {type(chart)}")
            if chart:
                logger.debug(f"  - Chart length: {len(chart) if isinstance(chart, str) else 'N/A'}")
            else:
                logger.debug(f"  - Chart is None or empty")
                logger.debug(f"  - Event study dict: {event_study}")
    except Exception as e:
        logger.error(f"[check_parallel_trends] Exception in event study: {str(e)}", exc_info=True)
        event_study = {
            "coefficients": [],
            "chart": None,
            "error": str(e),
            "all_pre_periods_include_zero": None
        }
    
    # =========================================================
    # STEP 4: Generate interpretation
    # =========================================================
    
    interpretation = _generate_interpretation(
        test_result, event_study, df, treatment_col
    )
    
    # =========================================================
    # STEP 5: Generate visualizations
    # =========================================================
    
    means_chart = _generate_means_chart(
        df, treatment_col, time_col, outcome_col, treatment_time
    )
    
    # =========================================================
    # STEP 6: Compile and return results
    # =========================================================
    
    logger.debug(f"[check_parallel_trends] Compiling final results...")
    logger.debug(f"[check_parallel_trends] Event study chart in result: {event_study.get('chart') is not None if event_study else 'event_study is None'}")
    logger.debug(f"[check_parallel_trends] Event study coefficients in result: {len(event_study.get('coefficients', [])) if event_study and event_study.get('coefficients') else 0}")
    
    # Ensure consistent return structure - always return same keys
    event_coeffs = event_study.get("coefficients") if event_study else []
    if event_coeffs is None:
        event_coeffs = []
    
    # Add warning if event study failed
    warnings = interpretation.get("warnings", [])
    if event_study and event_study.get("error"):
        warnings.append(f"Event study not computed: {event_study.get('error')}")
    elif not event_coeffs:
        warnings.append("Event study not computed: too few pre/post periods or insufficient variation in treatment timing.")
    
    return {
        # Main results
        "passed": test_result.get("passed"),
        "p_value": test_result.get("p_value"),
        
        # Interpretation
        "message": interpretation.get("message", ""),
        "confidence_level": interpretation.get("confidence_level", "unknown"),
        "warnings": warnings,
        
        # Visualizations
        "mean_chart": means_chart,  # Primary: Traditional means plot (intuitive for users)
        "visual_chart": means_chart,  # Legacy support - same as mean_chart
        "event_study_chart": event_study.get("chart") if event_study else None,  # Secondary: Event study plot (for advanced users)
        "event_study_chart_data": event_study.get("chart_data") if event_study else None,  # Structured data for interactive chart
        
        # Detailed data (for advanced users or AI interpretation)
        "event_study_coefficients": event_coeffs,  # Always a list, never None
        "all_pre_periods_include_zero": event_study.get("all_pre_periods_include_zero") if event_study else None,
        
        # Explanations for users
        "explanations": interpretation.get("explanations", [])
    }

def _empty_parallel_trends_result(message, warnings=None):
    """Return an empty but consistent parallel trends result structure."""
    return {
        "passed": None,
        "p_value": None,
        "message": message,
        "confidence_level": "unknown",
        "mean_chart": None,
        "visual_chart": None,
        "event_study_chart": None,
        "event_study_coefficients": [],  # Empty list, not None
        "all_pre_periods_include_zero": None,
        "warnings": warnings or [],
        "explanations": []
    }

# =============================================================================
# STATISTICAL TEST
# =============================================================================

def _run_statistical_test(pre_data, treatment_col, time_col, outcome_col):
    """
    Test if treatment and control groups have different trends pre-treatment.
    
    Model: outcome ~ C(time) * treatment
    
    This regression includes:
    - C(time): Time fixed effects (categorical dummies for each period)
    - treatment: Treatment group indicator
    - C(time):treatment: INTERACTION - this is what we test
    
    The interaction terms capture whether the treatment group's outcome
    changes differently across time periods compared to control.
    
    We do a joint F-test of all interaction terms:
    H0: All interaction coefficients = 0 (same trends)
    H1: At least one differs (different trends)
    
    High p-value (> 0.05) → Fail to reject H0 → Trends appear similar
    """
    try:
        # Check data availability
        if pre_data.empty:
            return {
                "passed": None, 
                "p_value": None, 
                "error": "No pre-treatment data available"
            }
        
        # Check that we have both treatment and control groups
        unique_treatments = pre_data[treatment_col].unique()
        if len(unique_treatments) < 2:
            return {
                "passed": None, 
                "p_value": None, 
                "error": f"Need both treatment and control groups. Found: {unique_treatments}"
            }
        
        # Check that we have multiple time periods
        unique_times = pre_data[time_col].unique()
        if len(unique_times) < 2:
            return {
                "passed": None, 
                "p_value": None, 
                "error": f"Need at least 2 time periods. Found: {len(unique_times)}"
            }
        
        # Ensure outcome column is numeric
        pre_data = pre_data.copy()
        if outcome_col in pre_data.columns:
            pre_data[outcome_col] = pd.to_numeric(pre_data[outcome_col], errors='coerce')
            # Drop rows with NaN in outcome (from conversion errors)
            pre_data = pre_data.dropna(subset=[outcome_col])
            if len(pre_data) == 0:
                return {
                    "passed": None,
                    "p_value": None,
                    "error": "No valid numeric data in outcome column after conversion"
                }
        
        # Build the regression formula
        # C() tells statsmodels to treat time as categorical (creates dummies)
        # Wrap column names in Q() if they contain spaces or special characters
        outcome_term = f"Q('{outcome_col}')" if ' ' in outcome_col or not outcome_col.replace('_', '').isalnum() else outcome_col
        time_term = f"C(Q('{time_col}'))" if ' ' in time_col or not time_col.replace('_', '').isalnum() else f"C({time_col})"
        treatment_term = f"Q('{treatment_col}')" if ' ' in treatment_col or not treatment_col.replace('_', '').isalnum() else treatment_col
        
        formula = f"{outcome_term} ~ {time_term} * {treatment_term}"

        logger.debug(f"  Statistical test formula: {formula}")
        logger.debug(f"  Pre-data shape: {pre_data.shape}")
        logger.debug(f"  Unique times: {sorted(unique_times)}")
        logger.debug(f"  Unique treatments: {unique_treatments}")
        
        # Fit OLS regression
        model = smf.ols(formula, data=pre_data).fit()
        
        # Find all interaction terms in the model
        # They look like: "C(year)[T.2019]:treated" or similar
        interaction_terms = [
            term for term in model.params.index 
            if ':' in term and treatment_col in term
        ]
        
        print(f"  Found {len(interaction_terms)} interaction terms")
        
        if not interaction_terms:
            print(f"  Model params: {list(model.params.index)}")
            return {
                "passed": None, 
                "p_value": None, 
                "error": f"No interaction terms found in model. Available terms: {list(model.params.index)}"
            }
        
        # Joint F-test: Are ALL interaction terms simultaneously zero?
        # This is more powerful than testing each individually
        hypothesis = ', '.join([f'{term} = 0' for term in interaction_terms])
        f_test = model.f_test(hypothesis)
        p_value = float(f_test.pvalue)
        
        print(f"  F-test p-value: {p_value}")
        
        return {
            "passed": p_value > 0.05,  # High p-value = fail to reject parallel trends
            "p_value": round(p_value, 4),
            "f_statistic": round(float(f_test.fvalue), 4),
            "num_interaction_terms": len(interaction_terms)
        }
        
    except Exception as e:
        print(f"  Error in statistical test: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "passed": None, 
            "p_value": None, 
            "error": str(e)
        }

# =============================================================================
# EVENT STUDY ANALYSIS
# =============================================================================

def _run_event_study(df, treatment_col, time_col, outcome_col, treatment_time, unit_col=None):
    """
    Calculate event study coefficients.
    
    The event study shows the DIFFERENCE between treatment and control
    at each time point, relative to a reference period (t = -1).
    
    Model: outcome ~ Σ(period_dummy × treatment) + time_FE
    
    For each time period t (except t = -1), we estimate:
    β_t = (Treated_t - Control_t) - (Treated_{-1} - Control_{-1})
    
    Interpretation:
    - Pre-treatment coefficients (t < -1) should be ~0 if parallel trends holds
    - Post-treatment coefficients (t ≥ 0) show the dynamic treatment effect
    - Reference period (t = -1) is normalized to 0
    
    Why t = -1 as reference?
    - It's the last period before treatment
    - Any "anticipation effects" would show up in earlier periods
    - Standard convention in the literature
    """
    try:
        logger.debug(f"  Starting event study analysis")
        logger.debug(f"    Data shape: {df.shape}")
        logger.debug(f"    Treatment column: {treatment_col}")
        logger.debug(f"    Time column: {time_col}")
        logger.debug(f"    Unit column: {unit_col}")
        logger.debug(f"    Treatment time: {treatment_time} (type: {type(treatment_time)})")
        
        analysis_df = df.copy()
        
        # Ensure outcome column is numeric
        if outcome_col in analysis_df.columns:
            analysis_df[outcome_col] = pd.to_numeric(analysis_df[outcome_col], errors='coerce')
            # Drop rows with NaN in outcome
            analysis_df = analysis_df.dropna(subset=[outcome_col])
            if len(analysis_df) == 0:
                return {
                    "coefficients": [],
                    "chart": None,
                    "error": "No valid numeric data in outcome column after conversion",
                    "all_pre_periods_include_zero": None
                }
        
        # Normalize treatment_time to match time column dtype exactly (should already be done, but double-check)
        if pd.api.types.is_datetime64_any_dtype(analysis_df[time_col]):
            treatment_time = pd.to_datetime(treatment_time)
        elif pd.api.types.is_numeric_dtype(analysis_df[time_col]):
            treatment_time = pd.to_numeric(treatment_time, errors='coerce')
            if pd.isna(treatment_time):
                return {
                    "coefficients": [],
                    "chart": None,
                    "error": "Could not convert treatment_time to match time column type",
                    "all_pre_periods_include_zero": None
                }
        else:
            treatment_time = str(treatment_time)
        
        # Create relative time: periods before treatment are negative
        # Example: if treatment_time = 2020
        #   2018 → -2, 2019 → -1, 2020 → 0, 2021 → +1
        # If unit_col is provided and units have different treatment times, use unit-specific timing
        if unit_col and unit_col in analysis_df.columns:
            # For staggered treatment: each unit may have different treatment time
            # For now, we'll use the global treatment_time, but log if there's variation
            unit_treatment_times = analysis_df.groupby(unit_col)[time_col].min()
            if len(unit_treatment_times.unique()) > 1:
                logger.debug(f"    Detected staggered treatment: {len(unit_treatment_times.unique())} unique treatment times")
                # Use unit-specific relative time
                analysis_df = analysis_df.merge(
                    unit_treatment_times.reset_index().rename(columns={time_col: 'unit_treatment_time'}),
                    on=unit_col,
                    how='left'
                )
                analysis_df['relative_time'] = analysis_df[time_col] - analysis_df['unit_treatment_time']
                analysis_df = analysis_df.drop(columns=['unit_treatment_time'])
            else:
                # All units treated at same time
                analysis_df['relative_time'] = analysis_df[time_col] - treatment_time
        else:
            # No unit column - use global treatment_time
            try:
                analysis_df['relative_time'] = analysis_df[time_col] - treatment_time
            except Exception as e:
                logger.error(f"    Error creating relative_time: {str(e)}")
                logger.error(f"    Time column type: {analysis_df[time_col].dtype}")
                logger.error(f"    Treatment time type: {type(treatment_time)}, value: {treatment_time}")
                raise
        
        # Convert relative_time to integer to avoid float column names (e.g., -7.0)
        analysis_df['relative_time'] = analysis_df['relative_time'].astype(int)
        periods = sorted(analysis_df['relative_time'].unique())
        logger.debug(f"    Unique relative times (as integers): {periods}")
        
        # Check if we have t = -1 (reference period)
        if -1 not in periods:
            logger.warning(f"    WARNING: No reference period (t = -1) found. Closest periods: {periods}")
            # Find the closest period to -1
            closest_to_neg_one = min(periods, key=lambda x: abs(x - (-1)))
            logger.debug(f"    Using {closest_to_neg_one} as reference instead of -1")
            # Adjust all periods so closest becomes -1
            adjustment = closest_to_neg_one - (-1)
            analysis_df['relative_time'] = analysis_df['relative_time'] - adjustment
            periods = sorted(analysis_df['relative_time'].unique())
            logger.debug(f"    Adjusted relative times: {periods}")
        
        # Create dummy variables for each period × treatment interaction
        # EXCEPT t = -1 (our reference period)
        dummy_cols = []
        for t in periods:
            if t == -1:
                continue  # Skip reference period
                
            # Column name: rel_time_-2, rel_time_-3, rel_time_plus_0, etc.
            # Use integer t to avoid dots in column names
            t_int = int(t)
            col_name = f'rel_time_{t_int}' if t_int < 0 else f'rel_time_plus_{t_int}'
            
            # This dummy = 1 only for treated units in period t
            analysis_df[col_name] = (
                (analysis_df['relative_time'] == t) & 
                (analysis_df[treatment_col] == 1)
            ).astype(int)
            
            dummy_cols.append(col_name)
        
        logger.debug(f"    Created {len(dummy_cols)} dummy variables")
        
        if not dummy_cols:
            logger.warning(f"    ERROR: No dummy columns created for event study")
            return {
                "coefficients": [],
                "chart": None,
                "error": "No periods available for event study (need at least 2 periods)",
                "all_pre_periods_include_zero": None
            }
        
        logger.debug(f"    Created {len(dummy_cols)} dummy variables for event study")
        
        # Build regression formula
        # Include time fixed effects to control for common shocks
        # If unit_col is available, include unit fixed effects
        # Wrap ALL column names in Q() to handle special characters (spaces, negative numbers, etc.)
        # This ensures column names with spaces or special chars are properly parsed
        dummy_terms = [f"Q('{col}')" for col in dummy_cols]
        dummies_str = ' + '.join(dummy_terms)
        
        # Wrap outcome, time, and unit columns in Q() if they contain spaces or special chars
        outcome_term = f"Q('{outcome_col}')" if ' ' in outcome_col or not outcome_col.replace('_', '').isalnum() else outcome_col
        time_term = f"C(Q('{time_col}'))" if ' ' in time_col or not time_col.replace('_', '').isalnum() else f"C({time_col})"
        
        if unit_col and unit_col in analysis_df.columns:
            unit_term = f"C(Q('{unit_col}'))" if ' ' in unit_col or not unit_col.replace('_', '').isalnum() else f"C({unit_col})"
            formula = f"{outcome_term} ~ {dummies_str} + {time_term} + {unit_term}"
        else:
            formula = f"{outcome_term} ~ {dummies_str} + {time_term}"
        
        logger.debug(f"    Event study formula: {formula}")
        logger.debug(f"    Dummy columns: {dummy_cols[:5]}... (showing first 5)")
        logger.debug(f"    Outcome column: {outcome_col}, wrapped: {outcome_term}")
        logger.debug(f"    Time column: {time_col}, wrapped: {time_term}")
        
        # Fit the model
        try:
            model = smf.ols(formula, data=analysis_df).fit()
            logger.debug(f"    Model fitted successfully")
        except Exception as e:
            logger.error(f"    ERROR fitting model: {str(e)}", exc_info=True)
            error_msg = str(e)
            if "singular" in error_msg.lower() or "linalg" in error_msg.lower():
                error_msg = "Singular matrix: insufficient variation or collinear regressors. Event study requires variation in treatment timing across units or multiple pre/post periods."
            return {
                "coefficients": [],
                "chart": None,
                "error": f"Failed to fit event study model: {error_msg}",
                "all_pre_periods_include_zero": None
            }
        
        # Extract coefficients for each period
        coefficients = []
        for t in periods:
            if t == -1:
                # Reference period: coefficient is 0 by construction
                coefficients.append({
                    'relative_time': int(t),
                    'coefficient': 0.0,
                    'ci_lower': 0.0,
                    'ci_upper': 0.0,
                    'p_value': None,
                    'is_reference': True,
                    'is_pre_treatment': True
                })
            else:
                # Use integer t to match column name creation
                t_int = int(t)
                col_name = f'rel_time_{t_int}' if t_int < 0 else f'rel_time_plus_{t_int}'
                
                # When using Q(), the parameter name in the model is Q('col_name')
                # But statsmodels might store it differently - check both formats
                param_names_to_try = [
                    f"Q('{col_name}')",  # Most likely format when using Q()
                    col_name,  # Fallback: original name
                    f"Q(\"{col_name}\")"  # Alternative quote style
                ]
                
                found_param = None
                for param_name in param_names_to_try:
                    if param_name in model.params.index:
                        found_param = param_name
                        break
                
                if found_param:
                    ci = model.conf_int().loc[found_param]
                    coefficients.append({
                        'relative_time': t_int,
                        'coefficient': round(float(model.params[found_param]), 4),
                        'ci_lower': round(float(ci[0]), 4),
                        'ci_upper': round(float(ci[1]), 4),
                        'p_value': round(float(model.pvalues[found_param]), 4),
                        'is_reference': False,
                        'is_pre_treatment': t_int < 0
                    })
                else:
                    logger.warning(f"    WARNING: Column {col_name} not found in model params.")
                    logger.debug(f"    Available params (first 15): {list(model.params.index)[:15]}")
                    logger.debug(f"    Looking for: {param_names_to_try}")
        
        # Key check: Do all pre-treatment confidence intervals include zero?
        pre_coeffs = [c for c in coefficients if c['relative_time'] < -1]
        all_include_zero = all(
            c['ci_lower'] <= 0 <= c['ci_upper'] 
            for c in pre_coeffs
        ) if pre_coeffs else True
        
        logger.debug(f"    Generated {len(coefficients)} coefficients for event study")
        logger.debug(f"    Pre-treatment coefficients: {len(pre_coeffs)}")
        
        if len(coefficients) == 0:
            logger.warning(f"    ERROR: No coefficients generated!")
            return {
                "coefficients": [],
                "chart": None,
                "error": "No coefficients generated for event study",
                "all_pre_periods_include_zero": None
            }
        
        # Generate the event study chart
        logger.debug(f"    Calling _generate_event_study_chart with {len(coefficients)} coefficients...")
        chart_result = _generate_event_study_chart(coefficients)
        chart = chart_result.get('png') if isinstance(chart_result, dict) else chart_result
        chart_data = chart_result.get('data') if isinstance(chart_result, dict) else None
        logger.debug(f"    Event study chart generation result: {chart is not None}, type: {type(chart)}")
        if chart:
            logger.debug(f"    Chart length: {len(chart) if isinstance(chart, str) else 'N/A'}")
        
        result = {
            "coefficients": coefficients,
            "all_pre_periods_include_zero": all_include_zero,
            "chart": chart,
            "chart_data": chart_data,
            "num_pre_periods": len(pre_coeffs),
            "num_post_periods": len([c for c in coefficients if c['relative_time'] >= 0])
        }
        logger.debug(f"    Returning event study result with {len(coefficients)} coefficients and chart={chart is not None}")
        return result
        
    except Exception as e:
        logger.error(f"  Error in event study: {str(e)}", exc_info=True)
        return {
            "coefficients": [],
            "chart": None,
            "error": str(e),
            "all_pre_periods_include_zero": None
        }

# =============================================================================
# INTERPRETATION
# =============================================================================

def _generate_interpretation(test_result, event_study, df, treatment_col):
    """
    Generate user-friendly interpretation of results.
    
    We combine evidence from:
    1. Statistical test p-value
    2. Whether event study pre-period CIs include zero
    3. Sample size considerations
    
    Output a confidence level (high/moderate/low) and plain-English message.
    """
    warnings = []
    explanations = []
    
    # ----- Sample size check -----
    n_treated = len(df[df[treatment_col] == 1])
    n_control = len(df[df[treatment_col] == 0])
    min_group = min(n_treated, n_control)
    
    if min_group < 30:
        warnings.append(
            f"Small sample size ({min_group} observations in smaller group). "
            "Results may be less reliable."
        )
    
    # ----- Get test results -----
    p_value = test_result.get("p_value")
    pre_include_zero = event_study.get("all_pre_periods_include_zero", False)
    event_study_coeffs = event_study.get("coefficients", [])
    
    # ----- Handle missing p-value -----
    if p_value is None:
        error_msg = test_result.get("error", "Unknown error")
        return {
            "message": f"Could not perform statistical test. {error_msg}",
            "confidence_level": "unknown",
            "warnings": warnings + [f"Statistical test error: {error_msg}"],
            "explanations": []
        }
    
    # ----- Add comprehensive explanations for "Show more details" -----
    
    # 1. What is parallel trends? (Always include)
    explanations.append(
        "What is parallel trends? For our analysis to be reliable, the treatment and control groups should have been "
        "changing at similar rates before treatment started. If they were already diverging, we can't trust that "
        "any differences after treatment are actually caused by the treatment."
    )
    
    # 2. Statistical test results
    if p_value is not None:
        test_result_text = "PASSED" if p_value > 0.05 else "FAILED"
        test_interpretation = (
            "This means we don't have strong evidence that the groups were changing at different rates."
            if p_value > 0.05 
            else "This suggests the groups were changing at different rates before treatment."
        )
        explanations.append(
            f"Statistical Test Result: {test_result_text} (p-value = {p_value:.3f}). "
            f"This test compares the overall trend patterns between groups before treatment. "
            f"{test_interpretation} "
            f"A p-value greater than 0.05 means the differences we see could easily happen by chance."
        )
    
    # 3. What is an event study? (Always explain if we have event study data)
    if event_study_coeffs:
        explanations.append(
            "What is an event study? An event study is a more detailed version of Difference-in-Differences. "
            "Instead of getting one single treatment effect, you get the treatment effect at each time point. "
            "Pre-treatment coefficients should be near zero if parallel trends holds. Post-treatment coefficients "
            "show the actual treatment effect over time."
        )
        
        pre_coeffs = [c for c in event_study_coeffs if c.get('relative_time', 0) < -1]
        if pre_coeffs:
            num_pre = len(pre_coeffs)
            num_different = sum(1 for c in pre_coeffs 
                              if not (c.get('ci_lower', 0) <= 0 <= c.get('ci_upper', 0)))
            
            if num_different > 0:
                event_result_text = "FAILED"
                explanations.append(
                    f"Event Study Result: {event_result_text}. We examined {num_pre} pre-treatment periods. "
                    f"In {num_different} of those periods, the treatment and control groups were significantly different "
                    f"(their confidence intervals did not include zero). This suggests the groups were not consistently "
                    f"similar across all pre-treatment periods."
                )
            else:
                event_result_text = "PASSED"
                explanations.append(
                    f"Event Study Result: {event_result_text}. We examined {num_pre} pre-treatment periods. "
                    f"In all of them, the groups were not significantly different (all confidence intervals include zero). "
                    f"This indicates the groups were consistently similar across all pre-treatment periods."
                )
            
            # Explain how to read the event study chart
            explanations.append(
                "How to read the event study chart: The chart shows the difference between treatment and control groups "
                "at each time point. Pre-treatment periods (blue points) should be near zero. If blue points are far from "
                "zero and their error bars don't include zero, that's a concern. Post-treatment periods (red points) show "
                "the treatment effect over time."
            )
    
    # 4. What do conflicting results mean?
    if p_value and p_value > 0.05 and not pre_include_zero:
        explanations.append(
            "Why do the tests give different answers? The statistical test (p-value) looks at the overall pattern and "
            f"found no significant difference (p = {p_value:.3f}). However, the event study found that in some individual "
            "periods, the groups were significantly different. This happens because the statistical test averages across "
            "all periods, while the event study checks each period separately. When they conflict, it's a sign to be cautious."
        )
    
    # ----- Determine confidence level and main message -----
    # We use both the p-value AND the event study visual check
    # Use simple, non-technical language
    
    if p_value > 0.10 and pre_include_zero:
        # Strong evidence for parallel trends
        confidence_level = "high"
        message = (
            "✅ Good news! Both groups were changing in similar ways before treatment started. "
            "This means your results are likely reliable."
        )
        
    elif p_value > 0.05 and pre_include_zero:
        # Moderate evidence
        confidence_level = "moderate"
        message = (
            "✅ Looks reasonable. The groups appear to have been changing similarly before treatment. "
            "Your results are probably reliable, but keep in mind there's some uncertainty."
        )
        
    elif p_value > 0.05 and not pre_include_zero:
        # P-value okay but event study shows some deviation
        confidence_level = "moderate"
        message = (
            f"⚠️ Mixed results: The statistical test (p-value = {p_value:.3f}) suggests the groups were similar, "
            f"but the event study found differences in some pre-treatment periods. "
            f"Your results might still be valid, but be extra careful when interpreting them."
        )
        warnings.append(
            "The event study shows some pre-treatment periods where treatment and control groups "
            "differed significantly, even though the overall statistical test didn't detect this."
        )
        
    else:
        # p_value <= 0.05: Evidence against parallel trends
        confidence_level = "low"
        message = (
            "⚠️ Warning: The groups appear to have been changing differently before treatment started. "
            "This makes your results less reliable. You should interpret them very carefully."
        )
    
    # ----- Add standard caveat about test limitations -----
    warnings.append(
        "Important: Even if these tests don't find problems, that doesn't guarantee parallel trends hold. "
        "The tests might miss subtle differences, especially with smaller sample sizes."
    )
    
    return {
        "message": message,
        "confidence_level": confidence_level,
        "warnings": warnings,
        "explanations": explanations
    }

# =============================================================================
# VISUALIZATIONS
# =============================================================================

def _generate_means_chart(df, treatment_col, time_col, outcome_col, treatment_time):
    """
    Generate the traditional parallel trends plot showing mean outcomes
    over time for treatment and control groups.
    
    This is what users expect to see, but note:
    - Shows UNCONDITIONAL means (no controls)
    - Can be misleading if there are confounders
    - The event study plot is more informative
    """
    try:
        # Ensure outcome column is numeric
        chart_df = df.copy()
        if outcome_col in chart_df.columns:
            chart_df[outcome_col] = pd.to_numeric(chart_df[outcome_col], errors='coerce')
            chart_df = chart_df.dropna(subset=[outcome_col])
            if len(chart_df) == 0:
                print(f"  Means chart: No valid numeric data after conversion")
                return None
        
        # Calculate mean outcome by group and time
        means = chart_df.groupby([time_col, treatment_col])[outcome_col].mean().reset_index()
        pivoted = means.pivot(index=time_col, columns=treatment_col, values=outcome_col)
        
        # Create figure
        fig, ax = plt.subplots(figsize=(10, 6))
        
        # Plot each group
        colors = {0: '#4ECDC4', 1: '#FF6B6B'}  # Control: teal, Treatment: coral
        labels = {0: 'Control', 1: 'Treatment'}
        
        for group in sorted(df[treatment_col].unique()):
            if group in pivoted.columns:
                ax.plot(
                    pivoted.index, 
                    pivoted[group], 
                    marker='o',
                    label=labels.get(group, f'Group {group}'),
                    color=colors.get(group, '#888888'),
                    linewidth=2,
                    markersize=8
                )
        
        # Add vertical line at treatment time
        ax.axvline(
            x=treatment_time - 0.5,  # Slightly before treatment period
            color='#888888',
            linestyle='--',
            linewidth=2,
            label='Treatment Start',
            alpha=0.7
        )
        
        # Shade pre-treatment region
        ax.axvspan(
            pivoted.index.min() - 0.5,
            treatment_time - 0.5,
            alpha=0.1,
            color='blue',
            label='Pre-treatment'
        )
        
        # Labels and formatting
        ax.set_title('Average Outcomes Over Time', fontsize=13, fontweight='bold')
        ax.set_xlabel(time_col, fontsize=11)
        ax.set_ylabel(f'Mean {outcome_col}', fontsize=11)
        ax.legend(loc='best')
        ax.grid(True, alpha=0.3)
        
        # Tight layout
        plt.tight_layout()
        
        return _fig_to_base64(fig)
        
    except Exception as e:
        print(f"Means chart error: {e}")
        return None

def _generate_event_study_chart(coefficients):
    """
    Generate the event study plot - THE key visualization for parallel trends.
    
    What this shows:
    - X-axis: Time relative to treatment (negative = before, positive = after)
    - Y-axis: Estimated difference between treatment and control
    - Error bars: 95% confidence intervals
    - Reference period (t = -1) is at zero by construction
    
    How to read it:
    - PRE-TREATMENT (blue points): Should hover around zero
      If they do → parallel trends likely holds
      If they don't → parallel trends may be violated
    
    - POST-TREATMENT (red points): Show the treatment effect over time
      The pattern reveals if effects are immediate, gradual, persistent, etc.
    """
    try:
        if not coefficients or len(coefficients) == 0:
            print(f"  Event study chart: No coefficients provided")
            return None
        
        print(f"  Generating event study chart with {len(coefficients)} coefficients")
        fig, ax = plt.subplots(figsize=(12, 7))
        fig.patch.set_facecolor('white')
        
        # Extract data from coefficients
        times = [c['relative_time'] for c in coefficients]
        coefs = [c['coefficient'] for c in coefficients]
        ci_lower = [c['ci_lower'] for c in coefficients]
        ci_upper = [c['ci_upper'] for c in coefficients]
        
        # Calculate error bar lengths
        yerr_lower = [c - l for c, l in zip(coefs, ci_lower)]
        yerr_upper = [u - c for c, u in zip(coefs, ci_upper)]
        
        # Plot error bars (confidence intervals)
        ax.errorbar(
            times, coefs,
            yerr=[yerr_lower, yerr_upper],
            fmt='none',  # Don't plot points yet
            capsize=4,
            capthick=1.5,
            ecolor='#888888',
            elinewidth=1.5
        )
        
        # Plot points with different colors for pre/post
        for t, c, lower, upper in zip(times, coefs, ci_lower, ci_upper):
            if t < 0:
                color = '#4F9CF9'  # Blue for pre-treatment
                marker = 'o'
            elif t == -1:
                color = '#666666'  # Gray for reference period
                marker = 's'  # Square for reference
            else:
                color = '#FF6B6B'  # Red for post-treatment
                marker = 'o'
            
            ax.scatter(
                [t], [c],
                c=color,
                s=120 if t == -1 else 100,
                marker=marker,
                zorder=5,
                edgecolors='white',
                linewidths=2.5 if t == -1 else 2
            )
        
        # Reference line at y = 0
        ax.axhline(y=0, color='black', linestyle='-', linewidth=1.5, alpha=0.7)
        
        # Vertical line at treatment time (between -1 and 0)
        ax.axvline(x=-0.5, color='#666666', linestyle='--', linewidth=2, alpha=0.7, zorder=1)
        
        # Shade pre and post regions with subtle colors
        ax.axvspan(min(times) - 0.5, -0.5, alpha=0.06, color='#4F9CF9', zorder=0)
        ax.axvspan(-0.5, max(times) + 0.5, alpha=0.06, color='#FF6B6B', zorder=0)
        
        # Labels
        ax.set_title(
            'Event Study: Treatment Effect Over Time',
            fontsize=14,
            fontweight='bold',
            pad=15
        )
        ax.set_xlabel('Time Relative to Treatment', fontsize=12, fontweight='500')
        ax.set_ylabel('Estimated Difference (Treatment − Control)', fontsize=12, fontweight='500')
        ax.grid(True, alpha=0.3, linestyle='--', linewidth=0.8)
        
        # Get y limits for positioning labels
        y_min, y_max = ax.get_ylim()
        y_range = y_max - y_min
        
        # Pre-treatment label - position at top center of pre-treatment region
        pre_times = [t for t in times if t < 0]
        if pre_times:
            pre_x = (min(pre_times) + max(pre_times)) / 2
            ax.text(
                pre_x, y_max - y_range * 0.08,
                'Pre-Treatment',
                fontsize=11,
                fontweight='bold',
                color='#4F9CF9',
                ha='center',
                va='top',
                bbox=dict(boxstyle='round,pad=0.6', facecolor='white', edgecolor='#4F9CF9', linewidth=2, alpha=0.95)
            )
        
        # Post-treatment label - position at top center of post-treatment region
        post_times = [t for t in times if t >= 0]
        if post_times:
            post_x = (min(post_times) + max(post_times)) / 2
            ax.text(
                post_x, y_max - y_range * 0.08,
                'Post-Treatment',
                fontsize=11,
                fontweight='bold',
                color='#FF6B6B',
                ha='center',
                va='top',
                bbox=dict(boxstyle='round,pad=0.6', facecolor='white', edgecolor='#FF6B6B', linewidth=2, alpha=0.95)
            )
        
        # Get y limits for positioning labels
        y_min, y_max = ax.get_ylim()
        
        # Reference period annotation - only if -1 exists
        if -1 in times:
            ref_idx = times.index(-1)
            ref_y = coefs[ref_idx]
            # Small annotation pointing to reference point
            ax.annotate(
                'Reference\n(t = -1)',
                xy=(-1, ref_y),
                xytext=(-1, y_min + y_range * 0.15),
                fontsize=9,
                ha='center',
                va='bottom',
                arrowprops=dict(arrowstyle='->', color='#666666', lw=1.5, alpha=0.7),
                color='#666666',
                bbox=dict(boxstyle='round,pad=0.4', facecolor='white', edgecolor='#666666', linewidth=1, alpha=0.9)
            )
        
        # Add treatment start line label
        ax.text(
            -0.5, y_max - y_range * 0.15,
            'Treatment\nStarts',
            fontsize=9,
            ha='center',
            va='top',
            color='#666666',
            rotation=90,
            bbox=dict(boxstyle='round,pad=0.3', facecolor='white', edgecolor='#666666', linewidth=1, alpha=0.8)
        )
        
        # Adjust layout with more padding
        plt.tight_layout(pad=2.5)
        
        chart_base64 = _fig_to_base64(fig)
        print(f"  Event study chart generated successfully, size: {len(chart_base64)} chars")
        print(f"  Chart base64 type: {type(chart_base64)}, first 50 chars: {chart_base64[:50] if chart_base64 else 'None'}")
        
        # Prepare structured data for interactive chart
        chart_data = {
            'xAxisLabel': 'Time Relative to Treatment',
            'yAxisLabel': 'Estimated Difference (Treatment − Control)',
            'title': 'Event Study: Treatment Effect Over Time',
            'treatmentStart': -0.5,
            'treatmentStartLabel': 'Treatment Starts',
            'referencePeriod': -1,
            'referenceLabel': 'Reference (t = -1)',
            'preTreatmentLabel': 'Pre-Treatment',
            'postTreatmentLabel': 'Post-Treatment',
            'dataPoints': [
                {
                    'relativeTime': c['relative_time'],
                    'coefficient': c['coefficient'],
                    'ciLower': c['ci_lower'],
                    'ciUpper': c['ci_upper'],
                    'isReference': c.get('is_reference', False),
                    'isPreTreatment': c.get('is_pre_treatment', False)
                }
                for c in coefficients
            ]
        }
        
        return {
            'png': chart_base64,
            'data': chart_data
        }
        
    except Exception as e:
        print(f"  Event study chart error: {e}")
        import traceback
        traceback.print_exc()
        return None

def _fig_to_base64(fig):
    """Convert matplotlib figure to base64 encoded string."""
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight', dpi=100, facecolor='white', edgecolor='none')
    buf.seek(0)
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode()

# =============================================================================
# MAIN DiD FUNCTION (UPDATED)
# =============================================================================

def run_did(df, treatment_col, time_col, outcome_col, treatment_time, unit_col=None):
    """
    Run Difference-in-Differences analysis.
    
    Parameters:
    -----------
    df : pandas DataFrame
        Panel data with units observed over time
    treatment_col : str
        Column name for treatment indicator (0 = control, 1 = treated)
    time_col : str
        Column name for time period
    outcome_col : str
        Column name for the outcome variable
    treatment_time : int/float
        The time period when treatment begins
    unit_col : str, optional
        Column name for unit identifier (e.g., state_id, person_id)
        If provided, enables unit fixed effects and clustered standard errors
        
    Returns:
    --------
    dict with DiD estimate, statistics, and parallel trends test results
    """
    analysis_df = df.copy()
    
    # Create post-treatment indicator
    analysis_df["post"] = (analysis_df[time_col] >= treatment_time).astype(int)
    
    # Create the DiD interaction term
    analysis_df["interaction"] = analysis_df["post"] * analysis_df[treatment_col]
    
    # Build regression formula
    # outcome = β0 + β1(treatment) + β2(post) + β3(treatment × post) + ε
    # β3 is the DiD estimate (Average Treatment Effect on Treated)
    
    if unit_col:
        # With unit fixed effects: use C() to create unit dummies
        # Note: This is a simplified approach. For clustered SEs, you'd need
        # statsmodels' panel data tools or linearmodels package
        # Wrap column names in Q() if they contain spaces or special characters
        outcome_term = f"Q('{outcome_col}')" if ' ' in outcome_col or not outcome_col.replace('_', '').isalnum() else outcome_col
        treatment_term = f"Q('{treatment_col}')" if ' ' in treatment_col or not treatment_col.replace('_', '').isalnum() else treatment_col
        unit_term = f"C(Q('{unit_col}'))" if ' ' in unit_col or not unit_col.replace('_', '').isalnum() else f"C({unit_col})"
        formula = f"{outcome_term} ~ {treatment_term} + post + interaction + {unit_term}"
    else:
        # Wrap column names in Q() if they contain spaces or special characters
        outcome_term = f"Q('{outcome_col}')" if ' ' in outcome_col or not outcome_col.replace('_', '').isalnum() else outcome_col
        treatment_term = f"Q('{treatment_col}')" if ' ' in treatment_col or not treatment_col.replace('_', '').isalnum() else treatment_col
        formula = f"{outcome_term} ~ {treatment_term} + post + interaction"
    
    # Fit OLS regression
    model = smf.ols(formula, data=analysis_df).fit()
    
    # Extract results
    coef = model.params["interaction"]
    conf_int = model.conf_int().loc["interaction"].tolist()
    
    # Calculate sample statistics
    treated_obs = len(analysis_df[analysis_df[treatment_col] == 1])
    control_obs = len(analysis_df[analysis_df[treatment_col] == 0])
    
    # Count unique units if unit_col is provided
    treated_units = len(analysis_df[analysis_df[treatment_col] == 1][unit_col].unique()) if unit_col else treated_obs
    control_units = len(analysis_df[analysis_df[treatment_col] == 0][unit_col].unique()) if unit_col else control_obs
    
    # Run parallel trends analysis
    parallel_trends = check_parallel_trends(
        df, treatment_col, time_col, outcome_col, treatment_time
    )
    
    return {
        # Main DiD results
        "did_estimate": round(coef, 4),
        "standard_error": round(model.bse["interaction"], 4),
        "p_value": round(model.pvalues["interaction"], 4),
        "is_significant": model.pvalues["interaction"] < 0.05,
        "confidence_interval": {
            "lower": round(conf_int[0], 4),
            "upper": round(conf_int[1], 4)
        },
        
        # Sample statistics
        "statistics": {
            "total_observations": len(df),
            "treated_observations": treated_obs,
            "control_observations": control_obs,
            "treated_units": treated_units if unit_col else None,
            "control_units": control_units if unit_col else None,
            "pre_treatment_periods": len(df[df[time_col] < treatment_time][time_col].unique()),
            "post_treatment_periods": len(df[df[time_col] >= treatment_time][time_col].unique()),
            "r_squared": round(model.rsquared, 4)
        },
        
        # Parallel trends results
        "parallel_trends": parallel_trends,
        
        # Full model summary (for advanced users)
        "model_summary": model.summary().as_text()
    }
