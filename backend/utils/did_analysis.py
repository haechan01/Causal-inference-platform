import statsmodels.formula.api as smf

def run_did(df, treatment_col, time_col, outcome_col, treatment_time):
    df["post"] = (df[time_col] >= treatment_time).astype(int)
    df["interaction"] = df["post"] * df[treatment_col]
    
    formula = f"{outcome_col} ~ {treatment_col} + post + interaction"
    model = smf.ols(formula, data=df).fit()
    
    coef = model.params["interaction"]
    conf_int = model.conf_int().loc["interaction"].tolist()
    
    return {
        "estimate": round(coef, 3),
        "conf_int": [round(conf_int[0], 3), round(conf_int[1], 3)],
        "summary": model.summary().as_text()
    }
