import statsmodels.formula.api as smf
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import base64
import io

def check_parallel_trends(df, treatment_col, time_col, outcome_col, treatment_time):
    """
    Check parallel trends assumption using pre-treatment data.
    Returns a dictionary with test results and a visual chart.
    """
    # Filter for pre-treatment data
    pre_data = df[df[time_col] < treatment_time].copy()
    
    # Check if we have enough data
    if pre_data.empty or len(pre_data[time_col].unique()) < 2:
        return {
            "passed": False,
            "p_value": None,
            "message": "Insufficient pre-treatment data",
            "visual_chart": None
        }
    
    # 1. Statistical Test
    # Model: outcome ~ time * treatment (on pre-treatment data)
    # We want to see if the slope of time differs for treatment vs control
    
    # Ensure time is treated as numeric for slope calculation if possible, otherwise treat as categorical?
    # For simple linear trend test, numeric is best.
    try:
        formula = f"{outcome_col} ~ {time_col} * {treatment_col}"
        model = smf.ols(formula, data=pre_data).fit()
        
        # Get interaction term p-value
        # Term name usually: f"{time_col}:{treatment_col}" or f"{treatment_col}:{time_col}"
        interaction_term = f"{time_col}:{treatment_col}"
        if interaction_term not in model.pvalues:
            interaction_term = f"{treatment_col}:{time_col}"
            
        if interaction_term in model.pvalues:
            p_value = model.pvalues[interaction_term]
            # If p > 0.05, we fail to reject null hypothesis (that slopes are same)
            # So parallel trends assumption HOLDS if p is high.
            passed = p_value > 0.05
        else:
            p_value = None
            passed = False # Could not test
            
    except Exception as e:
        print(f"Parallel trends test failed: {e}")
        p_value = None
        passed = False

    # 2. Visual Chart
    visual_chart = generate_parallel_trends_chart(df, treatment_col, time_col, outcome_col, treatment_time)

    return {
        "passed": passed,
        "p_value": round(p_value, 4) if p_value is not None else None,
        "visual_chart": visual_chart
    }

def generate_parallel_trends_chart(df, treatment_col, time_col, outcome_col, treatment_time):
    """Generate a plot of mean outcome over time by treatment group."""
    try:
        # Calculate means by group and time
        means = df.groupby([time_col, treatment_col])[outcome_col].mean().reset_index()
        
        # Pivot for easier plotting
        pivoted = means.pivot(index=time_col, columns=treatment_col, values=outcome_col)
        
        plt.figure(figsize=(10, 6))
        
        # Plot Control (usually 0) and Treatment (usually 1)
        # Assuming treatment_col has 0/1 or similar
        groups = sorted(df[treatment_col].unique())
        colors = ['#FF6B6B', '#4F9CF9'] # Red (Control), Blue (Treatment)
        
        for i, group in enumerate(groups):
            if group in pivoted.columns:
                label = "Treatment" if i == 1 else "Control"
                color = colors[i % len(colors)]
                plt.plot(pivoted.index, pivoted[group], marker='o', label=label, color=color, linewidth=2)
        
        # Add vertical line for treatment start
        plt.axvline(x=treatment_time - 0.5, color='#ffc107', linestyle='--', label='Treatment Start')
        
        plt.title('Parallel Trends Check', fontsize=14)
        plt.xlabel(time_col, fontsize=12)
        plt.ylabel(f'Mean {outcome_col}', fontsize=12)
        plt.legend()
        plt.grid(True, alpha=0.3)
        
        # Convert to base64
        img = io.BytesIO()
        plt.savefig(img, format='png', bbox_inches='tight')
        img.seek(0)
        plt.close()
        
        return base64.b64encode(img.getvalue()).decode()
        
    except Exception as e:
        print(f"Chart generation failed: {e}")
        return None

def run_did(df, treatment_col, time_col, outcome_col, treatment_time):
    # Run the main DiD analysis
    # We create copies to avoid SettingWithCopy warnings on the original df passed in
    analysis_df = df.copy()
    
    analysis_df["post"] = (analysis_df[time_col] >= treatment_time).astype(int)
    analysis_df["interaction"] = analysis_df["post"] * analysis_df[treatment_col]
    
    formula = f"{outcome_col} ~ {treatment_col} + post + interaction"
    model = smf.ols(formula, data=analysis_df).fit()
    
    coef = model.params["interaction"]
    conf_int = model.conf_int().loc["interaction"].tolist()
    
    # Calculate basic statistics
    treated_units = analysis_df[analysis_df[treatment_col] == 1][treatment_col].count() if 1 in analysis_df[treatment_col].values else 0
    control_units = analysis_df[analysis_df[treatment_col] == 0][treatment_col].count() if 0 in analysis_df[treatment_col].values else 0
    
    # Run Parallel Trends Test
    parallel_trends_results = check_parallel_trends(df, treatment_col, time_col, outcome_col, treatment_time)

    return {
        "did_estimate": round(coef, 3),
        "standard_error": round(model.bse["interaction"], 3),
        "p_value": round(model.pvalues["interaction"], 4),
        "is_significant": model.pvalues["interaction"] < 0.05,
        "confidence_interval": {
            "lower": round(conf_int[0], 3),
            "upper": round(conf_int[1], 3)
        },
        "statistics": {
            "total_observations": len(df),
            "treated_units": int(treated_units),
            "control_units": int(control_units),
            "r_squared": round(model.rsquared, 3)
        },
        "parallel_trends_test": parallel_trends_results,
        "model_summary": model.summary().as_text()
    }
