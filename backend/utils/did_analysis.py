import statsmodels.formula.api as smf
import pandas as pd
import matplotlib.pyplot as plt
import base64
import io
import sys

def check_parallel_trends(df, treatment_col, time_col, outcome_col, treatment_time):
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
    treatment_time : int/float
        The time period when treatment begins
        
    Returns:
    --------
    dict with test results, interpretation, and visualizations
    """
    print("=" * 80)
    print(f"[check_parallel_trends] FUNCTION CALLED")
    print(f"[check_parallel_trends] Starting with treatment_time={treatment_time}, type={type(treatment_time)}")
    sys.stdout.flush()
    print(f"[check_parallel_trends] Data shape: {df.shape}, columns: {list(df.columns)}")
    sys.stdout.flush()
    
    # =========================================================
    # STEP 1: Validate we have enough data
    # =========================================================
    
    pre_data = df[df[time_col] < treatment_time].copy()
    pre_periods = sorted(pre_data[time_col].unique())
    print(f"[check_parallel_trends] Pre-treatment periods: {pre_periods}, count: {len(pre_periods)}")
    
    # We need at least 2 pre-treatment periods:
    # - One to use as reference (t = -1)
    # - At least one other to compare against
    if len(pre_periods) < 2:
        return {
            "passed": None,
            "p_value": None,
            "message": "Need at least 2 pre-treatment periods to test parallel trends.",
            "confidence_level": "unknown",
            "mean_chart": None,
            "visual_chart": None,  # Legacy support
            "event_study_chart": None,
            "event_study_coefficients": None,
            "all_pre_periods_include_zero": None,
            "warnings": ["Insufficient data for parallel trends test."],
            "explanations": []
        }
    
    # =========================================================
    # STEP 2: Run the statistical test
    # =========================================================
    
    test_result = _run_statistical_test(
        pre_data, treatment_col, time_col, outcome_col
    )
    
    # =========================================================
    # STEP 3: Run the event study analysis
    # =========================================================
    
    print(f"[check_parallel_trends] Running event study analysis...")
    sys.stdout.flush()
    print(f"[check_parallel_trends] Full dataframe shape: {df.shape}")
    print(f"[check_parallel_trends] Full dataframe columns: {list(df.columns)}")
    print(f"[check_parallel_trends] Treatment column '{treatment_col}' exists: {treatment_col in df.columns}")
    print(f"[check_parallel_trends] Time column '{time_col}' exists: {time_col in df.columns}")
    print(f"[check_parallel_trends] Outcome column '{outcome_col}' exists: {outcome_col in df.columns}")
    sys.stdout.flush()
    
    try:
        event_study = _run_event_study(
            df, treatment_col, time_col, outcome_col, treatment_time
        )
        print(f"[check_parallel_trends] Event study returned: {type(event_study)}")
        sys.stdout.flush()
        print(f"[check_parallel_trends] Event study keys: {list(event_study.keys()) if isinstance(event_study, dict) else 'Not a dict'}")
        sys.stdout.flush()
        
        if event_study.get("error"):
            print(f"[check_parallel_trends] Event study error: {event_study.get('error')}")
            sys.stdout.flush()
        else:
            coeffs = event_study.get('coefficients', [])
            chart = event_study.get('chart')
            print(f"[check_parallel_trends] Event study completed:")
            print(f"  - Coefficients: {len(coeffs) if coeffs else 0}")
            print(f"  - Chart exists: {chart is not None}")
            print(f"  - Chart type: {type(chart)}")
            if chart:
                print(f"  - Chart length: {len(chart) if isinstance(chart, str) else 'N/A'}")
            else:
                print(f"  - Chart is None or empty")
                print(f"  - Event study dict: {event_study}")
            sys.stdout.flush()
    except Exception as e:
        print(f"[check_parallel_trends] Exception in event study: {str(e)}")
        import traceback
        traceback.print_exc()
        event_study = {
            "coefficients": None,
            "chart": None,
            "error": str(e)
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
    
    print(f"[check_parallel_trends] Compiling final results...")
    sys.stdout.flush()
    print(f"[check_parallel_trends] Event study chart in result: {event_study.get('chart') is not None if event_study else 'event_study is None'}")
    print(f"[check_parallel_trends] Event study coefficients in result: {len(event_study.get('coefficients', [])) if event_study and event_study.get('coefficients') else 0}")
    print(f"[check_parallel_trends] Full event_study dict: {event_study}")
    sys.stdout.flush()
    
    return {
        # Main results
        "passed": test_result.get("passed"),
        "p_value": test_result.get("p_value"),
        
        # Interpretation
        "message": interpretation["message"],
        "confidence_level": interpretation["confidence_level"],
        "warnings": interpretation["warnings"],
        
        # Visualizations
        "mean_chart": means_chart,  # Primary: Traditional means plot (intuitive for users)
        "visual_chart": means_chart,  # Legacy support - same as mean_chart
        "event_study_chart": event_study.get("chart") if event_study else None,  # Secondary: Event study plot (for advanced users)
        
        # Detailed data (for advanced users or AI interpretation)
        "event_study_coefficients": event_study.get("coefficients") if event_study else None,
        "all_pre_periods_include_zero": event_study.get("all_pre_periods_include_zero") if event_study else None,
        
        # Explanations for users
        "explanations": interpretation.get("explanations", [])
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
        formula = f"{outcome_col} ~ C({time_col}) * {treatment_col}"
        
        print(f"  Statistical test formula: {formula}")
        print(f"  Pre-data shape: {pre_data.shape}")
        print(f"  Unique times: {sorted(unique_times)}")
        print(f"  Unique treatments: {unique_treatments}")
        
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

def _run_event_study(df, treatment_col, time_col, outcome_col, treatment_time):
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
        print(f"  Starting event study analysis")
        sys.stdout.flush()
        print(f"    Data shape: {df.shape}")
        print(f"    Treatment column: {treatment_col}")
        print(f"    Time column: {time_col}")
        print(f"    Treatment time: {treatment_time} (type: {type(treatment_time)})")
        sys.stdout.flush()
        
        analysis_df = df.copy()
        
        # Ensure outcome column is numeric
        if outcome_col in analysis_df.columns:
            analysis_df[outcome_col] = pd.to_numeric(analysis_df[outcome_col], errors='coerce')
            # Drop rows with NaN in outcome
            analysis_df = analysis_df.dropna(subset=[outcome_col])
            if len(analysis_df) == 0:
                return {
                    "coefficients": None,
                    "chart": None,
                    "error": "No valid numeric data in outcome column after conversion"
                }
        
        # Ensure treatment_time matches the time column type
        if pd.api.types.is_numeric_dtype(analysis_df[time_col]):
            treatment_time = float(treatment_time)
        else:
            treatment_time = str(treatment_time)
        
        # Create relative time: periods before treatment are negative
        # Example: if treatment_time = 2020
        #   2018 → -2, 2019 → -1, 2020 → 0, 2021 → +1
        try:
            analysis_df['relative_time'] = analysis_df[time_col] - treatment_time
        except Exception as e:
            print(f"    Error creating relative_time: {str(e)}")
            print(f"    Time column type: {analysis_df[time_col].dtype}")
            print(f"    Treatment time type: {type(treatment_time)}, value: {treatment_time}")
            sys.stdout.flush()
            raise
        
        periods = sorted(analysis_df['relative_time'].unique())
        print(f"    Unique relative times: {periods}")
        sys.stdout.flush()
        
        # Check if we have t = -1 (reference period)
        if -1 not in periods:
            print(f"    WARNING: No reference period (t = -1) found. Closest periods: {periods}")
            # Find the closest period to -1
            closest_to_neg_one = min(periods, key=lambda x: abs(x - (-1)))
            print(f"    Using {closest_to_neg_one} as reference instead of -1")
            # Adjust all periods so closest becomes -1
            adjustment = closest_to_neg_one - (-1)
            analysis_df['relative_time'] = analysis_df['relative_time'] - adjustment
            periods = sorted(analysis_df['relative_time'].unique())
            print(f"    Adjusted relative times: {periods}")
        
        # Create dummy variables for each period × treatment interaction
        # EXCEPT t = -1 (our reference period)
        dummy_cols = []
        for t in periods:
            if t == -1:
                continue  # Skip reference period
                
            # Column name: rel_time_-2, rel_time_-3, rel_time_plus_0, etc.
            col_name = f'rel_time_{t}' if t < 0 else f'rel_time_plus_{t}'
            
            # This dummy = 1 only for treated units in period t
            analysis_df[col_name] = (
                (analysis_df['relative_time'] == t) & 
                (analysis_df[treatment_col] == 1)
            ).astype(int)
            
            dummy_cols.append(col_name)
        
        print(f"    Created {len(dummy_cols)} dummy variables")
        
        if not dummy_cols:
            print(f"    ERROR: No dummy columns created for event study")
            sys.stdout.flush()
            return {
                "coefficients": None,
                "chart": None,
                "error": "No periods available for event study (need at least 2 periods)"
            }
        
        print(f"    Created {len(dummy_cols)} dummy variables for event study")
        sys.stdout.flush()
        
        # Build regression formula
        # Include time fixed effects to control for common shocks
        dummies_str = ' + '.join(dummy_cols)
        formula = f"{outcome_col} ~ {dummies_str} + C({time_col})"
        
        print(f"    Event study formula: {formula}")
        sys.stdout.flush()
        
        # Fit the model
        try:
            model = smf.ols(formula, data=analysis_df).fit()
            print(f"    Model fitted successfully")
            sys.stdout.flush()
        except Exception as e:
            print(f"    ERROR fitting model: {str(e)}")
            import traceback
            traceback.print_exc()
            sys.stdout.flush()
            return {
                "coefficients": None,
                "chart": None,
                "error": f"Failed to fit event study model: {str(e)}"
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
                col_name = f'rel_time_{t}' if t < 0 else f'rel_time_plus_{t}'
                
                if col_name in model.params:
                    ci = model.conf_int().loc[col_name]
                    coefficients.append({
                        'relative_time': int(t),
                        'coefficient': round(float(model.params[col_name]), 4),
                        'ci_lower': round(float(ci[0]), 4),
                        'ci_upper': round(float(ci[1]), 4),
                        'p_value': round(float(model.pvalues[col_name]), 4),
                        'is_reference': False,
                        'is_pre_treatment': t < 0
                    })
                else:
                    print(f"    WARNING: Column {col_name} not found in model params. Available params: {list(model.params.index)[:10]}")
                    sys.stdout.flush()
        
        # Key check: Do all pre-treatment confidence intervals include zero?
        pre_coeffs = [c for c in coefficients if c['relative_time'] < -1]
        all_include_zero = all(
            c['ci_lower'] <= 0 <= c['ci_upper'] 
            for c in pre_coeffs
        ) if pre_coeffs else True
        
        print(f"    Generated {len(coefficients)} coefficients for event study")
        print(f"    Pre-treatment coefficients: {len(pre_coeffs)}")
        sys.stdout.flush()
        
        if len(coefficients) == 0:
            print(f"    ERROR: No coefficients generated!")
            sys.stdout.flush()
            return {
                "coefficients": None,
                "chart": None,
                "error": "No coefficients generated for event study"
            }
        
        # Generate the event study chart
        print(f"    Calling _generate_event_study_chart with {len(coefficients)} coefficients...")
        sys.stdout.flush()
        chart = _generate_event_study_chart(coefficients)
        print(f"    Event study chart generation result: {chart is not None}, type: {type(chart)}")
        if chart:
            print(f"    Chart length: {len(chart) if isinstance(chart, str) else 'N/A'}")
        sys.stdout.flush()
        
        result = {
            "coefficients": coefficients,
            "all_pre_periods_include_zero": all_include_zero,
            "chart": chart,
            "num_pre_periods": len(pre_coeffs),
            "num_post_periods": len([c for c in coefficients if c['relative_time'] >= 0])
        }
        print(f"    Returning event study result with {len(coefficients)} coefficients and chart={chart is not None}")
        sys.stdout.flush()
        return result
        
    except Exception as e:
        print(f"  Error in event study: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "coefficients": None, 
            "chart": None, 
            "error": str(e)
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
        fig, ax = plt.subplots(figsize=(10, 6))
        
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
            else:
                color = '#FF6B6B'  # Red for post-treatment
            
            ax.scatter(
                [t], [c],
                c=color,
                s=100,
                zorder=5,
                edgecolors='white',
                linewidths=2
            )
        
        # Reference line at y = 0
        ax.axhline(y=0, color='black', linestyle='-', linewidth=1)
        
        # Vertical line at treatment time (between -1 and 0)
        ax.axvline(x=-0.5, color='#FFD93D', linestyle='--', linewidth=2.5, alpha=0.8)
        
        # Shade pre and post regions
        ax.axvspan(min(times) - 0.5, -0.5, alpha=0.08, color='blue')
        ax.axvspan(-0.5, max(times) + 0.5, alpha=0.08, color='red')
        
        # Labels
        ax.set_title(
            'Event Study: Treatment vs Control Over Time\n'
            '(Pre-treatment coefficients should be near zero)',
            fontsize=12,
            fontweight='bold'
        )
        ax.set_xlabel('Time Relative to Treatment', fontsize=11)
        ax.set_ylabel('Estimated Difference\n(Treatment − Control)', fontsize=11)
        ax.grid(True, alpha=0.3)
        
        # Add helpful annotations
        y_range = max(ci_upper) - min(ci_lower)
        
        ax.annotate(
            'Pre-treatment\n(check: ≈ 0?)',
            xy=(min(times) + 0.5, 0),
            fontsize=9,
            color='#4F9CF9',
            ha='left',
            va='bottom',
            fontweight='bold'
        )
        
        ax.annotate(
            'Post-treatment\n(treatment effect)',
            xy=(max(times) - 0.5, coefs[-1]),
            fontsize=9,
            color='#FF6B6B',
            ha='right',
            va='top',
            fontweight='bold'
        )
        
        ax.annotate(
            '← Reference (t = −1)',
            xy=(-1, 0),
            xytext=(-1, y_range * 0.3),
            fontsize=8,
            ha='center',
            arrowprops=dict(arrowstyle='->', color='gray', lw=1),
            color='gray'
        )
        
        plt.tight_layout()
        
        chart_base64 = _fig_to_base64(fig)
        print(f"  Event study chart generated successfully, size: {len(chart_base64)} chars")
        print(f"  Chart base64 type: {type(chart_base64)}, first 50 chars: {chart_base64[:50] if chart_base64 else 'None'}")
        return chart_base64
        
    except Exception as e:
        print(f"  Event study chart error: {e}")
        import traceback
        traceback.print_exc()
        return None

def _fig_to_base64(fig):
    """Convert matplotlib figure to base64 encoded string."""
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight', dpi=120)
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
        formula = f"{outcome_col} ~ {treatment_col} + post + interaction + C({unit_col})"
    else:
        formula = f"{outcome_col} ~ {treatment_col} + post + interaction"
    
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
