import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell, ErrorBar,
} from 'recharts';
import { useLocation, useNavigate } from 'react-router-dom';
import { Navbar, BottomProgressBar } from '../components/layout';
import { formatPValue } from '../utils/format';
import { useProgressStep } from '../hooks/useProgressStep';
import { aiService, ResultsInterpretation } from '../services/aiService';
import { useAuth } from '../contexts/AuthContext';
import { projectStateService } from '../services/projectStateService';

const COLLAPSE_THRESHOLD = 200;
const MAX_MESSAGE_LENGTH = 2000;

// ── Helper components ────────────────────────────────────────────────────────

const StatPill: React.FC<{ label: string; value: string; color?: string }> = ({
  label,
  value,
  color = '#043873',
}) => (
  <div style={pillStyles.container}>
    <span style={pillStyles.label}>{label}</span>
    <span style={{ ...pillStyles.value, color }}>{value}</span>
  </div>
);

const pillStyles = {
  container: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    padding: '14px 20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '10px',
    border: '1px solid #e9ecef',
    minWidth: '120px',
  },
  label: { fontSize: '12px', color: '#666', marginBottom: '6px' },
  value: { fontSize: '20px', fontWeight: 'bold' as const },
};

const StrengthBadge: React.FC<{ strength: string }> = ({ strength }) => {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    strong: { bg: '#d4edda', color: '#155724', label: 'Strong' },
    moderate: { bg: '#fff3cd', color: '#856404', label: 'Moderate' },
    weak: { bg: '#ffe5d0', color: '#7d3c0d', label: 'Weak' },
    very_weak: { bg: '#f8d7da', color: '#721c24', label: 'Very Weak' },
  };
  const c = cfg[strength] || cfg['weak'];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: '20px',
        backgroundColor: c.bg,
        color: c.color,
        fontSize: '13px',
        fontWeight: '600' as const,
      }}
    >
      {c.label}
    </span>
  );
};

// ── IVResults ────────────────────────────────────────────────────────────────
const IVResults: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { currentStep, steps, goToPreviousStep, goToNextStep, navigateToStep } =
    useProgressStep();

  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [aiInterpretation, setAiInterpretation] =
    useState<ResultsInterpretation | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [aiSidebarWidth, setAiSidebarWidth] = useState(480);
  const [isResizing, setIsResizing] = useState(false);
  const [isAiSidebarCollapsed, setIsAiSidebarCollapsed] = useState(false);

  const [chatMessages, setChatMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string; timestamp?: string }>
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [datasetInfo, setDatasetInfo] = useState<any>(null);

  const [expandedStat, setExpandedStat] = useState<
    'ci' | 'pvalue' | 'se' | null
  >(null);
  const [showCode, setShowCode] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState<'python' | 'r' | 'stata'>('python');
  const [outcomeLabel, setOutcomeLabel] = useState<string>('');
  const [editingOutcomeLabel, setEditingOutcomeLabel] = useState(false);

  // ── Chart label customisation ─────────────────────────────────────────────
  const [chartTitle, setChartTitle] = useState('OLS vs 2SLS: Causal Effect Estimate');
  const [chartYLabel, setChartYLabel] = useState('Estimated Effect');
  const [chartXLabel, setChartXLabel] = useState('Estimator');
  const [chartOlsLabel, setChartOlsLabel] = useState('OLS');
  const [chart2slsLabel, setChart2slsLabel] = useState('2SLS');
  const [editingChartField, setEditingChartField] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const recommendedQuestions = [
    'What is the exclusion restriction assumption?',
    'How do I interpret the first-stage F-statistic?',
    'What are the limitations of 2SLS estimation?',
  ];

  // Generate Python code for IV analysis
  const generatePythonCode = () => {
    if (!results?.parameters) return '';
    const p = results.parameters;
    const instrumentsList = (p.instruments || []).join("', '");
    const controlsList = (p.controls || []).join("', '");
    const hasControls = p.controls && p.controls.length > 0;
    const hasMultipleInstruments = p.instruments && p.instruments.length > 1;
    return `# Instrumental Variables (2SLS) Analysis
# Generated by Causal Platform
# Install: pip install linearmodels statsmodels pandas numpy matplotlib

import pandas as pd
import numpy as np
import statsmodels.api as sm
import matplotlib.pyplot as plt
from linearmodels.iv import IV2SLS

# ── Load your data ────────────────────────────────────────────────────────────
# df = pd.read_csv('your_data.csv')

# ── Variable definitions ──────────────────────────────────────────────────────
outcome_var   = '${p.outcome}'
treatment_var = '${p.treatment}'
instruments   = ['${instrumentsList}']
controls      = ${hasControls ? `['${controlsList}']` : '[]'}

# ── Prepare data matrices ─────────────────────────────────────────────────────
y       = df[outcome_var]
X_endog = df[[treatment_var]]                       # endogenous treatment
Z_instr = df[instruments]                            # instruments
X_exog  = sm.add_constant(df[controls]) if controls else pd.DataFrame(
    {'const': np.ones(len(df))}, index=df.index)    # exogenous controls + constant

# ── Step 1: First Stage — how well do instruments predict treatment? ──────────
X_first = pd.concat([X_exog, Z_instr], axis=1)
first_stage = sm.OLS(X_endog, X_first).fit()
print("=== FIRST STAGE REGRESSION ===")
print(first_stage.summary())
print(f"\\nFirst-Stage F-statistic: {first_stage.fvalue:.4f}  (p = {first_stage.f_pvalue:.4f})")
print("  → F > 10 required;  F > 16 recommended (Stock-Yogo threshold)")
print(f"  → Instrument{'s are' if len(instruments) > 1 else ' is'} {'STRONG ✓' if first_stage.fvalue > 10 else 'WEAK — interpret with caution ⚠'}")

# ── Step 2: 2SLS Estimation (linearmodels) ────────────────────────────────────
iv_model = IV2SLS(y, X_exog, X_endog, Z_instr).fit(cov_type='robust')
print("\\n=== 2SLS RESULTS ===")
print(iv_model.summary)

iv_coef = iv_model.params[treatment_var]
iv_se   = iv_model.std_errors[treatment_var]
iv_ci   = iv_model.conf_int().loc[treatment_var]
iv_pval = iv_model.pvalues[treatment_var]

print(f"\\nTreatment Effect (2SLS): {iv_coef:.4f}")
print(f"Standard Error:          {iv_se:.4f}")
print(f"P-value:                 {iv_pval:.4f}  {'(significant ✓)' if iv_pval < 0.05 else '(not significant)'}")
print(f"95% CI:                  [{iv_ci['lower']:.4f}, {iv_ci['upper']:.4f}]")

# ── Step 3: OLS for comparison (how much endogeneity bias is corrected?) ──────
X_ols = sm.add_constant(pd.concat([df[[treatment_var]],
                                    df[controls] if controls else pd.DataFrame()],
                                   axis=1))
ols_model = sm.OLS(y, X_ols).fit(cov_type='HC3')
ols_coef  = ols_model.params[treatment_var]
print("\\n=== OLS vs 2SLS COMPARISON ===")
print(f"OLS Estimate:  {ols_coef:.4f}  (biased if treatment is endogenous)")
print(f"2SLS Estimate: {iv_coef:.4f}  (corrected for endogeneity)")
print(f"Difference:    {iv_coef - ols_coef:+.4f}  (endogeneity bias corrected by IV)")

# ── Step 4: Wu-Hausman endogeneity test ───────────────────────────────────────
# Tests H0: treatment is exogenous (OLS is consistent)
hausman = iv_model.wu_hausman()
print("\\n=== WU-HAUSMAN ENDOGENEITY TEST ===")
print(hausman)
print("  → p < 0.05: treatment IS endogenous → IV is necessary")
print("  → p >= 0.05: endogeneity not confirmed → OLS may also be valid")
${hasMultipleInstruments ? `
# ── Step 5: Sargan-Hansen overidentification test ─────────────────────────────
# Tests H0: all instruments satisfy the exclusion restriction
# Only applicable when you have more instruments than endogenous variables
sargan = iv_model.sargan
print("\\n=== SARGAN-HANSEN OVERIDENTIFICATION TEST ===")
print(sargan)
print("  → p < 0.05: at least one instrument may violate exclusion restriction")
print("  → p >= 0.05: instruments pass the overidentification check ✓")
` : '# Step 5: Sargan-Hansen test not applicable (just-identified: 1 instrument for 1 treatment)'}
# ── Step 6: Visualizations ────────────────────────────────────────────────────
fig, axes = plt.subplots(1, 2, figsize=(14, 5))

# Panel A: OLS vs 2SLS coefficient comparison
estimates = {'OLS': ols_coef, '2SLS': iv_coef}
errors    = {'OLS': ols_model.bse[treatment_var] * 1.96,
             '2SLS': iv_se * 1.96}
ax = axes[0]
bars = ax.bar(list(estimates.keys()), list(estimates.values()),
              yerr=list(errors.values()), capsize=8,
              color=['#FF6B6B', '#4F9CF9'], alpha=0.85, edgecolor='black')
ax.axhline(0, color='black', linestyle='--', linewidth=0.8)
ax.set_title(f'OLS vs 2SLS: Effect of ${p.treatment} on ${p.outcome}')
ax.set_ylabel('Estimated Effect')
ax.set_xlabel('Estimator')
for bar, val in zip(bars, estimates.values()):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.002,
            f'{val:.3f}', ha='center', va='bottom', fontsize=11, fontweight='bold')

# Panel B: First stage — instruments vs treatment (scatter)
ax2 = axes[1]
for instr in instruments:
    ax2.scatter(df[instr], df[treatment_var], alpha=0.35, label=instr, s=20)
ax2.set_xlabel("Instrument(s)")
ax2.set_ylabel("${p.treatment} (treatment)")
ax2.set_title(f"First Stage: Instruments vs ${p.treatment}")
if len(instruments) > 1:
    ax2.legend(fontsize=9)

plt.tight_layout()
plt.savefig('iv_results.png', dpi=300, bbox_inches='tight')
plt.show()`;
  };

  // Generate R code for IV analysis
  const generateRCode = () => {
    if (!results?.parameters) return '';
    const p = results.parameters;
    const instrumentsR = (p.instruments || []).map((i: string) => `"${i}"`).join(', ');
    const controlsR = (p.controls || []).map((c: string) => `"${c}"`).join(', ');
    const hasMultipleInstruments = p.instruments && p.instruments.length > 1;
    return `# Instrumental Variables (2SLS) Analysis
# Generated by Causal Platform
# Install: install.packages(c("AER", "estimatr", "tidyverse", "ggplot2", "lmtest", "sandwich"))

library(tidyverse)
library(AER)        # ivreg() + diagnostic tests (Wu-Hausman, Sargan)
library(estimatr)   # lm_robust(), iv_robust() with HC-robust SEs
library(ggplot2)
library(lmtest)
library(sandwich)

# ── Load your data ────────────────────────────────────────────────────────────
# df <- read.csv("your_data.csv")

# ── Variable definitions ──────────────────────────────────────────────────────
outcome_var   <- "${p.outcome}"
treatment_var <- "${p.treatment}"
instruments   <- c(${instrumentsR})
controls      <- c(${controlsR})

# ── Step 1: First Stage — how well do instruments predict treatment? ──────────
first_stage_formula <- as.formula(paste(
  treatment_var, "~",
  paste(c(instruments, if (length(controls) > 0) controls), collapse = " + ")
))
first_stage <- lm(first_stage_formula, data = df)
cat("=== FIRST STAGE REGRESSION ===\\n")
summary(first_stage)

fstat <- summary(first_stage)$fstatistic
f_val <- fstat[1]; f_p <- pf(f_val, fstat[2], fstat[3], lower.tail = FALSE)
cat(sprintf("\\nFirst-Stage F-statistic: %.4f  (p = %.4f)\\n", f_val, f_p))
cat("  → F > 10 required;  F > 16 recommended (Stock-Yogo threshold)\\n")
cat(sprintf("  → Instrument(s) are %s\\n",
            ifelse(f_val > 10, "STRONG ✓", "WEAK — interpret with caution ⚠")))

# ── Step 2: 2SLS Estimation (iv_robust, HC2 robust SEs) ──────────────────────
iv_formula <- as.formula(paste(
  outcome_var, "~",
  paste(c(treatment_var, if (length(controls) > 0) controls), collapse = " + "),
  "|",
  paste(c(instruments, if (length(controls) > 0) controls), collapse = " + ")
))
iv_model <- iv_robust(iv_formula, data = df, se_type = "HC2")
cat("\\n=== 2SLS RESULTS ===\\n")
summary(iv_model)

iv_coef <- coef(iv_model)[treatment_var]
iv_se   <- sqrt(diag(vcov(iv_model)))[treatment_var]
iv_ci   <- confint(iv_model)[treatment_var, ]
iv_pval <- summary(iv_model)$coefficients[treatment_var, "Pr(>|t|)"]

cat(sprintf("\\nTreatment Effect (2SLS): %.4f\\n", iv_coef))
cat(sprintf("Standard Error:          %.4f\\n", iv_se))
cat(sprintf("P-value:                 %.4f  %s\\n", iv_pval,
            ifelse(iv_pval < 0.05, "(significant ✓)", "(not significant)")))
cat(sprintf("95%% CI:                  [%.4f, %.4f]\\n", iv_ci[1], iv_ci[2]))

# ── Step 3: OLS for comparison ────────────────────────────────────────────────
ols_formula <- as.formula(paste(
  outcome_var, "~",
  paste(c(treatment_var, if (length(controls) > 0) controls), collapse = " + ")
))
ols_model <- lm_robust(ols_formula, data = df, se_type = "HC2")
ols_coef  <- coef(ols_model)[treatment_var]

cat("\\n=== OLS vs 2SLS COMPARISON ===\\n")
cat(sprintf("OLS Estimate:  %.4f  (biased if treatment is endogenous)\\n", ols_coef))
cat(sprintf("2SLS Estimate: %.4f  (corrected for endogeneity)\\n", iv_coef))
cat(sprintf("Difference:    %+.4f  (endogeneity bias corrected by IV)\\n",
            iv_coef - ols_coef))

# ── Step 4: Wu-Hausman endogeneity test (AER ivreg diagnostics) ───────────────
iv_aer   <- ivreg(iv_formula, data = df)
diag_tbl <- summary(iv_aer, diagnostics = TRUE)$diagnostics
cat("\\n=== WU-HAUSMAN ENDOGENEITY TEST ===\\n")
print(diag_tbl["Wu-Hausman", ])
cat("  → p < 0.05: treatment IS endogenous → IV is necessary\\n")
cat("  → p >= 0.05: endogeneity not confirmed → OLS may also be valid\\n")
${hasMultipleInstruments ? `
# ── Step 5: Sargan-Hansen overidentification test ─────────────────────────────
cat("\\n=== SARGAN-HANSEN OVERIDENTIFICATION TEST ===\\n")
print(diag_tbl["Sargan", ])
cat("  → p < 0.05: at least one instrument may violate exclusion restriction\\n")
cat("  → p >= 0.05: instruments pass the overidentification check ✓\\n")
` : '# Step 5: Sargan-Hansen not applicable (just-identified: 1 instrument for 1 treatment)'}
# ── Step 6: Visualizations ────────────────────────────────────────────────────
# A: OLS vs 2SLS coefficient comparison
est_df <- tibble(
  Method   = c("OLS", "2SLS"),
  Estimate = c(ols_coef, iv_coef),
  SE       = c(sqrt(diag(vcov(ols_model)))[treatment_var], iv_se)
)

p1 <- ggplot(est_df, aes(x = Method, y = Estimate, color = Method)) +
  geom_point(size = 5) +
  geom_errorbar(aes(ymin = Estimate - 1.96 * SE,
                    ymax = Estimate + 1.96 * SE),
                width = 0.25, linewidth = 1.2) +
  geom_hline(yintercept = 0, linetype = "dashed", alpha = 0.5) +
  geom_text(aes(label = sprintf("%.3f", Estimate)),
            vjust = -1.5, fontface = "bold", size = 4) +
  scale_color_manual(values = c("OLS" = "#FF6B6B", "2SLS" = "#4F9CF9")) +
  labs(title    = paste0("OLS vs 2SLS: Effect of ${p.treatment} on ${p.outcome}"),
       subtitle = "Error bars = 95% confidence intervals",
       y = "Estimated Effect",
       x = "Estimator") +
  theme_minimal() +
  theme(legend.position = "none")

ggsave("iv_comparison.png", plot = p1, width = 8, height = 5, dpi = 300)
print(p1)

# B: First stage — instrument(s) vs treatment
p2 <- ggplot(df, aes(x = .data[[instruments[1]]], y = .data[[treatment_var]])) +
  geom_point(alpha = 0.35, size = 1.5, color = "#4F9CF9") +
  geom_smooth(method = "lm", se = TRUE, color = "#043873", linewidth = 1) +
  labs(title = paste0("First Stage: ", instruments[1], " vs ", treatment_var),
       x = instruments[1],
       y = treatment_var) +
  theme_minimal()

ggsave("iv_first_stage.png", plot = p2, width = 8, height = 5, dpi = 300)
print(p2)`;
  };

  // Generate Stata code for IV analysis
  const generateStataCode = () => {
    if (!results?.parameters) return '';
    const p = results.parameters;
    const instrumentsStata = (p.instruments || []).join(' ');
    const controlsStata = (p.controls || []).join(' ');
    const hasControls = p.controls && p.controls.length > 0;
    const hasMultipleInstruments = p.instruments && p.instruments.length > 1;
    return `* Instrumental Variables (2SLS) Analysis
* Generated by Causal Platform

* ── Load your data ────────────────────────────────────────────────────────────
* use "your_data.dta", clear
* import delimited "your_data.csv", clear

* ── Variable definitions ──────────────────────────────────────────────────────
local outcome    "${p.outcome}"
local treatment  "${p.treatment}"
local instruments "${instrumentsStata}"
local controls   "${controlsStata}"

* ── Step 1: First Stage — how well do instruments predict treatment? ──────────
regress ${p.treatment} ${instrumentsStata}${hasControls ? ` ${controlsStata}` : ''}
display "First-Stage F-statistic: " %9.4f e(F)
display "  → F > 10 required;  F > 16 recommended (Stock-Yogo threshold)"
* estat firststage   // available after ivregress to get first-stage F in IV context

* ── Step 2: 2SLS Estimation ──────────────────────────────────────────────────
ivregress 2sls ${p.outcome}${hasControls ? ` ${controlsStata}` : ''} (${p.treatment} = ${instrumentsStata}), robust

display "Treatment Effect (2SLS): " %9.4f _b[${p.treatment}]
display "Standard Error:          " %9.4f _se[${p.treatment}]
lincom ${p.treatment}   // prints estimate + 95% CI

* ── Step 3: First-stage F from IV context (Stock-Yogo weak instrument test) ──
estat firststage
* Rule of thumb: F > 10 (or > 16.38 for 5% maximal IV relative bias, 1 instrument)

* ── Step 4: Wu-Hausman endogeneity test ───────────────────────────────────────
* Tests H0: treatment is exogenous (OLS would be consistent)
estat endogenous
display "  → p < 0.05: treatment IS endogenous → IV is necessary"
display "  → p >= 0.05: endogeneity not confirmed → OLS may also be valid"
${hasMultipleInstruments
  ? `
* ── Step 5: Sargan-Hansen overidentification test ─────────────────────────────
* Tests H0: all instruments satisfy the exclusion restriction
* Only valid when #instruments > #endogenous variables
estat overid
display "  → p < 0.05: at least one instrument may violate exclusion restriction"
display "  → p >= 0.05: instruments pass the overidentification check"
`
  : `* Step 5: Sargan-Hansen not applicable (just-identified: 1 instrument for 1 treatment)`}
* ── Step 6: OLS for comparison ────────────────────────────────────────────────
regress ${p.outcome} ${p.treatment}${hasControls ? ` ${controlsStata}` : ''}, robust
local ols_b = _b[${p.treatment}]
display "OLS Estimate:  " %9.4f \`ols_b'
display "  → Compare with 2SLS to gauge endogeneity bias corrected by IV"

* ── Step 7: Visualization — OLS vs 2SLS coefficient plot ─────────────────────
* (Requires the coefplot package: ssc install coefplot)
* Run OLS then 2SLS, storing estimates:
* estimates store OLS
* ivregress 2sls ${p.outcome}${hasControls ? ` ${controlsStata}` : ''} (${p.treatment} = ${instrumentsStata}), robust
* estimates store IV2SLS
* coefplot OLS IV2SLS, keep(${p.treatment}) vertical ///
*   title("OLS vs 2SLS: Effect of ${p.treatment} on ${p.outcome}") ///
*   xtitle("Estimator") ytitle("Estimated Effect") ///
*   legend(order(2 "OLS" 4 "2SLS"))
* graph export "iv_results.png", replace width(2000)`;
  };

  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  // ── Load results ──────────────────────────────────────────────────────────
  useEffect(() => {
    const loadResults = async () => {
      const projectId =
        (location.state as any)?.projectId ||
        parseInt(
          new URLSearchParams(location.search).get('projectId') || '0'
        ) ||
        null;

      let loadedResults: any = null;

      // 1. Project state (backend)
      if (projectId && accessToken) {
        try {
          const project = await projectStateService.loadProject(
            projectId,
            accessToken
          );
          if (project.lastResults?.results && project.lastResults?.parameters) {
            loadedResults = project.lastResults;
          }
        } catch (err) {
          console.warn('Failed to load IV results from project state:', err);
        }
      }

      // 2. localStorage keyed by project
      if (!loadedResults && projectId) {
        const stored = localStorage.getItem(`ivAnalysisResults_${projectId}`);
        if (stored) {
          try {
            loadedResults = JSON.parse(stored);
          } catch (e) {
            console.warn('Failed to parse IV results from localStorage:', e);
          }
        }
      }

      // 3. Fallback global key
      if (!loadedResults) {
        const stored = localStorage.getItem('ivAnalysisResults');
        if (stored) {
          try {
            loadedResults = JSON.parse(stored);
          } catch (e) {
            console.warn('Failed to parse IV results:', e);
          }
        }
      }

      if (loadedResults) {
        // Ensure variable names available: use parameters or build from metadata (e.g. from analysis route)
        const params = loadedResults.parameters || (loadedResults.metadata?.columns_used && (() => {
          const cu = loadedResults.metadata.columns_used;
          return {
            outcome: cu.outcome || 'outcome',
            treatment: cu.treatment || 'treatment',
            instruments: Array.isArray(cu.instruments) ? cu.instruments : (cu.instruments ? [cu.instruments] : []),
            controls: Array.isArray(cu.controls) ? cu.controls : (cu.controls ? [cu.controls] : []),
          };
        })()) || { outcome: 'outcome', treatment: 'treatment', instruments: [], controls: [] };
        if (!loadedResults.parameters && (loadedResults.metadata?.columns_used || loadedResults.results)) {
          loadedResults = { ...loadedResults, parameters: params };
        }
        setResults(loadedResults);
        setOutcomeLabel(params.outcome || 'outcome');

        // Load cached AI interpretation
        const interpretationKey = projectId
          ? `ivAiInterpretation_${projectId}`
          : 'ivAiInterpretation';
        const storedInterp = localStorage.getItem(interpretationKey);
        if (storedInterp) {
          try {
            const parsed = JSON.parse(storedInterp);
            const res = loadedResults.results || {};
            const currentKey = JSON.stringify({
              dataset_id: loadedResults.dataset_id,
              treatment_effect: res.treatment_effect,
              p_value: res.p_value,
            });
            if (parsed.analysisKey === currentKey) {
              setAiInterpretation(parsed.interpretation);
            } else {
              localStorage.removeItem(interpretationKey);
            }
          } catch {
            /* ignore */
          }
        }
      }

      setLoading(false);
    };

    loadResults();
  }, [accessToken, location.state, location.search]);

  // ── Load dataset info for chat context ────────────────────────────────────
  useEffect(() => {
    if (!results || !accessToken) return;
    const loadDatasetInfo = async () => {
      const datasetId =
        results.dataset_id || (location.state as any)?.datasetId;
      const projectId = (location.state as any)?.projectId;
      if (!datasetId) return;
      try {
        const axios = (await import('axios')).default;
        if (projectId) {
          const resp = await axios.get(`/projects/${projectId}/datasets`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const dataset = (resp.data.datasets || []).find(
            (d: any) => d.id === datasetId
          );
          if (dataset) {
            try {
              const prev = await axios.get(`/datasets/${datasetId}/preview`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              setDatasetInfo({
                name: dataset.name,
                columns: prev.data.columns || [],
                summary: prev.data.summary || {},
              });
            } catch {
              setDatasetInfo({ name: dataset.name, columns: [], summary: {} });
            }
          }
        }
      } catch (err) {
        console.error('Error loading dataset info:', err);
      }
    };
    loadDatasetInfo();
  }, [results, accessToken, location.state]);

  // ── Scroll chat ───────────────────────────────────────────────────────────
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── AI sidebar resize ─────────────────────────────────────────────────────
  useEffect(() => {
    let lastWidth = aiSidebarWidth;
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const container = document.querySelector(
        '[data-iv-main-layout]'
      ) as HTMLElement;
      if (!container) return;
      const newWidth = container.getBoundingClientRect().right - e.clientX;
      const clamped = Math.max(COLLAPSE_THRESHOLD, Math.min(800, newWidth));
      lastWidth = clamped;
      if (clamped <= COLLAPSE_THRESHOLD) {
        setIsAiSidebarCollapsed(true);
      } else {
        setIsAiSidebarCollapsed(false);
        setAiSidebarWidth(clamped);
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      if (lastWidth <= COLLAPSE_THRESHOLD) setIsAiSidebarCollapsed(true);
    };
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, aiSidebarWidth]);

  // ── AI interpretation ─────────────────────────────────────────────────────
  const loadAIInterpretation = async () => {
    if (!results?.results || !results?.parameters) {
      setAiError('Results or parameters not available');
      return;
    }
    setLoadingAI(true);
    setAiError(null);
    try {
      const interpretation = await aiService.interpretResults(
        results.results,
        results.parameters,
        undefined,
        'Instrumental Variables (2SLS)'
      );
      setAiInterpretation(interpretation);

      const res = results.results || {};
      const analysisKey = JSON.stringify({
        dataset_id: results.dataset_id,
        treatment_effect: res.treatment_effect,
        p_value: res.p_value,
      });
      const projectId =
        (location.state as any)?.projectId ||
        parseInt(
          new URLSearchParams(location.search).get('projectId') || '0'
        ) ||
        null;
      const interpKey = projectId
        ? `ivAiInterpretation_${projectId}`
        : 'ivAiInterpretation';
      localStorage.setItem(
        interpKey,
        JSON.stringify({
          analysisKey,
          interpretation,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (error: any) {
      setAiError(
        error.response?.data?.error ||
          error.message ||
          'Failed to get AI interpretation'
      );
    } finally {
      setLoadingAI(false);
    }
  };

  // ── Chat ──────────────────────────────────────────────────────────────────
  const handleSendMessage = async () => {
    const message = chatInput.trim();
    if (!message || chatLoading) return;
    if (message.length > MAX_MESSAGE_LENGTH) {
      setChatError(`Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`);
      return;
    }
    setChatError(null);
    setChatLoading(true);
    const userMessage = {
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput('');
    try {
      const history = chatMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const analysisContext = results
        ? {
            method: 'iv',
            analysis_type: 'instrumental_variable',
            parameters: results.parameters,
            results: results.results,
            ai_interpretation: aiInterpretation || undefined,
          }
        : undefined;
      const response = await aiService.chat(
        message,
        history,
        analysisContext,
        datasetInfo
      );
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant' as const,
          content: response.response,
          timestamp: response.timestamp,
        },
      ]);
    } catch (error: any) {
      setChatError(
        error.response?.data?.error ||
          error.message ||
          'Failed to send message'
      );
      setChatMessages((prev) => prev.slice(0, -1));
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ── Chart download ────────────────────────────────────────────────────────
  const downloadChart = useCallback(async () => {
    if (!chartRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(chartRef.current, {
        background: '#ffffff',
        scale: 2,
        useCORS: true,
      } as any);
      const link = document.createElement('a');
      link.download = 'iv_comparison_chart.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Chart download failed:', err);
    }
  }, []);

  // ── Loading / no results ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <Navbar />
        <div style={styles.loadingContainer}>
          <div style={styles.loadingSpinner}></div>
          <p style={styles.loadingText}>Loading results...</p>
        </div>
      </div>
    );
  }

  if (!results || !results.results) {
    return (
      <div>
        <Navbar />
        <div style={styles.errorContainer}>
          <h2 style={styles.errorTitle}>No Results Found</h2>
          <p style={styles.errorMessage}>
            No IV analysis results available. Please run an analysis first.
          </p>
          <button
            onClick={() => navigate('/method-selection')}
            style={styles.backButton}
          >
            Go to Method Selection
          </button>
        </div>
      </div>
    );
  }

  // Variable names: prefer parameters, fallback to metadata.columns_used
  const parameters = results.parameters || (results.metadata?.columns_used && (() => {
    const cu = results.metadata.columns_used;
    return {
      outcome: cu.outcome || 'outcome',
      treatment: cu.treatment || 'treatment',
      instruments: Array.isArray(cu.instruments) ? cu.instruments : (cu.instruments ? [cu.instruments] : []),
      controls: Array.isArray(cu.controls) ? cu.controls : (cu.controls ? [cu.controls] : []),
    };
  })()) || { outcome: 'outcome', treatment: 'treatment', instruments: [], controls: [] };
  const { results: res } = results;
  const isSignificant = res.p_value < 0.05;
  const isWeak = res.instrument_strength?.is_weak;
  const overid = res.overidentification_test;
  const overidApplicable = overid && !overid.not_applicable;
  const sensitivity = results.sensitivity_analysis;

  return (
    <div>
      <Navbar />
      <div style={styles.contentContainer}>
        <div
          data-iv-main-layout
          style={{
            ...styles.mainLayout,
            justifyContent: isAiSidebarCollapsed ? 'center' : 'flex-start',
          }}
        >
          {/* ── Main content ── */}
          <div
            style={{
              ...styles.mainContent,
              flex: isAiSidebarCollapsed ? '1 1 auto' : '1 1 60%',
              maxWidth: isAiSidebarCollapsed ? '1100px' : 'none',
              margin: isAiSidebarCollapsed ? '0 auto' : '0',
            }}
          >
            <div style={styles.header}>
              <h1 style={styles.title}>Instrumental Variables Results</h1>
              <p style={styles.subtitle}>
                Causal effect of <strong>{parameters.treatment}</strong> on{' '}
                <strong>{parameters.outcome}</strong>
                <span style={{ fontSize: '14px', color: '#888', marginLeft: '8px' }}>(estimated via Two-Stage Least Squares)</span>
              </p>
              {parameters.instruments && (
                <p style={styles.subtitleSmall}>
                  Instruments: {(parameters.instruments as string[]).join(', ')}
                </p>
              )}
            </div>

            <div style={styles.content}>



              {/* ── Main result card ── */}
              <div style={styles.mainResultCard}>
                <div style={styles.estimandLabel}>
                  2SLS Causal Effect Estimate
                  {res.estimand && (
                    <span style={styles.estimandBadge}>{res.estimand}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
                  <div style={styles.effectValue}>
                    {typeof res.treatment_effect === 'number'
                      ? res.treatment_effect.toFixed(3)
                      : '—'}
                  </div>
                  {editingOutcomeLabel ? (
                    <input
                      autoFocus
                      value={outcomeLabel}
                      onChange={e => setOutcomeLabel(e.target.value)}
                      onBlur={() => setEditingOutcomeLabel(false)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingOutcomeLabel(false); }}
                      style={{
                        fontSize: '18px', color: '#043873',
                        border: 'none', borderBottom: '2px solid #043873',
                        background: 'transparent', outline: 'none',
                        fontWeight: '500', textAlign: 'center',
                        padding: '2px 6px', minWidth: '80px', maxWidth: '200px',
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => setEditingOutcomeLabel(true)}
                      title="Click to edit variable name"
                      style={{
                        fontSize: '17px', color: '#043873', fontWeight: '500',
                        cursor: 'pointer', padding: '4px 10px',
                        border: '1px dashed #b3d0ff', borderRadius: '8px',
                        backgroundColor: '#f0f7ff',
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                      }}
                    >
                      {outcomeLabel}
                      <span style={{ fontSize: '11px', color: '#6c9bd4', marginLeft: '4px' }}>edit</span>
                    </span>
                  )}
                </div>
                <div
                  style={{
                    ...styles.significanceBadge,
                    ...(isSignificant
                      ? styles.significantBadge
                      : styles.notSignificantBadge),
                  }}
                >
                  {isSignificant
                    ? 'Statistically Significant (p < 0.05)'
                    : 'Not Statistically Significant (p \u2265 0.05)'}
                </div>

                {isWeak && (
                  <div style={styles.weakInstrumentWarning}>
                    <strong>Weak instruments detected.</strong> 2SLS
                    estimates may be biased toward OLS. Interpret with caution.
                  </div>
                )}

                {/* Plain-language interpretation */}
                <div style={styles.plainEnglishBox}>
                  <span style={styles.plainEnglishLabel}>In plain terms</span>
                  <p style={styles.plainEnglishText}>
                    {isSignificant
                      ? <>A one-unit increase in <strong>{parameters.treatment}</strong> causes approximately a <strong>{res.treatment_effect > 0 ? '+' : ''}{res.treatment_effect?.toFixed(3)}</strong> unit {res.treatment_effect > 0 ? 'increase' : 'decrease'} in <strong>{parameters.outcome}</strong>, after correcting for confounding. This estimate applies specifically to units whose treatment was influenced by the instrument{parameters.instruments?.length > 1 ? 's' : ''} (known as "compliers").</>
                      : <>The analysis did not find a statistically reliable causal effect of <strong>{parameters.treatment}</strong> on <strong>{parameters.outcome}</strong>. This could mean the true effect is small, the sample is not large enough to detect it, or the instruments do not provide sufficient information.</>
                    }
                  </p>
                </div>

                {/* Stats row */}
                <div style={styles.statsRow}>
                  <div style={styles.statRowItem}>
                    <span style={styles.statRowLabel}>95% CI</span>
                    <span style={{ ...styles.statRowValue, fontFamily: 'monospace' }}>
                      [{res.ci_lower?.toFixed(3)}, {res.ci_upper?.toFixed(3)}]
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedStat((s) => (s === 'ci' ? null : 'ci'))
                      }
                      style={
                        expandedStat === 'ci'
                          ? styles.expandButtonActive
                          : styles.expandButton
                      }
                    >
                      {expandedStat === 'ci' ? '▼ Hide' : '▶ How is this derived?'}
                    </button>
                  </div>
                  <div style={styles.statRowItem}>
                    <span style={styles.statRowLabel}>P-Value</span>
                    <span style={styles.statRowValue}>
                      {formatPValue(res.p_value)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedStat((s) => (s === 'pvalue' ? null : 'pvalue'))
                      }
                      style={
                        expandedStat === 'pvalue'
                          ? styles.expandButtonActive
                          : styles.expandButton
                      }
                    >
                      {expandedStat === 'pvalue' ? '▼ Hide' : '▶ How is this derived?'}
                    </button>
                  </div>
                  <div style={styles.statRowItem}>
                    <span style={styles.statRowLabel}>Standard Error</span>
                    <span style={styles.statRowValue}>
                      {res.se?.toFixed(4)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedStat((s) => (s === 'se' ? null : 'se'))
                      }
                      style={
                        expandedStat === 'se'
                          ? styles.expandButtonActive
                          : styles.expandButton
                      }
                    >
                      {expandedStat === 'se' ? '▼ Hide' : '▶ How is this derived?'}
                    </button>
                  </div>
                </div>

                {expandedStat && (
                  <div style={styles.explanationBox}>
                    {expandedStat === 'ci' && (
                      <>
                        <p style={styles.explanationSimple}>
                          <strong>Simply put:</strong> We are 95% confident the true causal effect falls between{' '}
                          <strong>{res.ci_lower?.toFixed(3)}</strong> and <strong>{res.ci_upper?.toFixed(3)}</strong>.
                          {res.ci_lower > 0 || res.ci_upper < 0
                            ? ' Since this range does not include zero, the effect is statistically significant.'
                            : ' Since this range includes zero, we cannot rule out that there is no effect.'}
                        </p>
                        <p style={styles.explanationText}>
                          <strong>Technical detail:</strong> Computed as estimate ± 1.96 × SE
                          = {res.treatment_effect?.toFixed(3)} ± 1.96 × {res.se?.toFixed(4)}
                          = [{res.ci_lower?.toFixed(3)}, {res.ci_upper?.toFixed(3)}].
                          Uses asymptotic 2SLS standard errors from structural residuals.
                        </p>
                      </>
                    )}
                    {expandedStat === 'pvalue' && (
                      <>
                        <p style={styles.explanationSimple}>
                          <strong>Simply put:</strong> The p-value of <strong>{formatPValue(res.p_value)}</strong> represents
                          the probability of seeing an effect this large (or larger) purely by chance if there were truly no effect.
                          {res.p_value < 0.05
                            ? ' Since it is below 0.05, the result is considered statistically significant.'
                            : ' Since it is above 0.05, the result is not statistically significant at the conventional threshold.'}
                        </p>
                        <p style={styles.explanationText}>
                          <strong>Technical detail:</strong> Derived from z-statistic = estimate / SE
                          = {res.treatment_effect?.toFixed(3)} / {res.se?.toFixed(4)}
                          ≈ {res.z_statistic?.toFixed(3)}.
                          Two-tailed p-value under a standard normal distribution.
                        </p>
                      </>
                    )}
                    {expandedStat === 'se' && (
                      <>
                        <p style={styles.explanationSimple}>
                          <strong>Simply put:</strong> The standard error ({res.se?.toFixed(4)}) measures
                          the precision of the estimated effect — smaller means more precise. It accounts
                          for the extra uncertainty introduced by the two-stage estimation process.
                        </p>
                        <p style={styles.explanationText}>
                          <strong>Technical detail:</strong> Computed from structural residuals
                          (Y − X·β using original X, not predicted X̂):
                          σ² = residuals'·residuals / (n − k), n = {res.n_obs},
                          k = {1 + 1 + (res.n_controls || 0)} (intercept + treatment + controls).
                          Var(β) = σ² × (X̂′X̂)⁻¹. Structural residuals give correct, consistent SEs.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* Meta info */}
                <div style={styles.metaRow}>
                  <StatPill label="Observations" value={String(res.n_obs || '—')} />
                  <StatPill label="Instruments" value={String(res.n_instruments || '—')} />
                  <StatPill
                    label="Controls"
                    value={String(res.n_controls || 0)}
                    color="#555"
                  />
                </div>
              </div>

              {/* ── Instrument Strength (First Stage) — one panel per treatment-instrument pair ── */}
              {(res.first_stage_per_endogenous
                ? Object.entries(res.first_stage_per_endogenous)
                : res.first_stage && res.instrument_strength
                  ? [[parameters.treatment, { instruments: parameters.instruments || [], first_stage: res.first_stage, instrument_strength: res.instrument_strength }]] as [string, any][]
                  : [] as [string, any][]
              ).map((pair: [string, any]) => {
                const [endoVar, pairData] = pair;
                if (pairData.error) {
                  return (
                    <div key={endoVar} style={styles.infoCard}>
                      <h3 style={styles.infoTitle}>First Stage: <strong>{endoVar}</strong></h3>
                      <p style={styles.mutedNote}>First-stage diagnostics failed: {pairData.error}</p>
                    </div>
                  );
                }
                const fs = pairData.first_stage;
                const si = pairData.instrument_strength;
                const pairInstruments: string[] = pairData.instruments || [];
                if (!fs || !si) return null;
                const pairIsWeak = si.is_weak;
                return (
                  <div key={endoVar} style={styles.infoCard}>
                    <h3 style={styles.infoTitle}>
                      Instrument Strength (First Stage)
                      <span style={{ fontWeight: 400, fontSize: '14px', color: '#555', marginLeft: '8px' }}>
                        — <strong>{pairInstruments.join(', ')}</strong> → <strong>{endoVar}</strong>
                      </span>
                    </h3>

                    <div style={styles.strengthHeader}>
                      <div>
                        <span style={styles.fStatValue}>
                          F = {fs.f_statistic?.toFixed(2)}
                        </span>
                        <span style={styles.fStatNote}>
                          {' '}(p = {formatPValue(fs.f_p_value)})
                        </span>
                      </div>
                      <StrengthBadge strength={si.strength} />
                    </div>

                    <p style={styles.strengthMessage}>{si.message}</p>

                    {/* F-stat visual bar */}
                    <div style={styles.fStatBarWrapper}>
                      <div style={styles.fStatBarTrack}>
                        <div style={styles.fStatBarZone1} title="Very weak (F < 5)">Very Weak</div>
                        <div style={styles.fStatBarZone2} title="Weak (F 5–10)">Weak</div>
                        <div style={styles.fStatBarZone3} title="Acceptable (F 10–16)">OK</div>
                        <div style={styles.fStatBarZone4} title="Strong (F > 16)">Strong</div>
                      </div>
                      <div style={{
                        ...styles.fStatBarMarker,
                        left: `${Math.min(98, Math.max(1, ((fs.f_statistic || 0) / 40) * 100))}%`,
                      }}>
                        <div style={styles.fStatBarPin} />
                        <div style={styles.fStatBarPinLabel}>
                          F = {fs.f_statistic?.toFixed(1)}
                        </div>
                      </div>
                    </div>

                    <div style={{ ...styles.plainEnglishBox, marginTop: '14px', marginBottom: '0' }}>
                      <span style={styles.plainEnglishLabel}>What this means</span>
                      <p style={styles.plainEnglishText}>
                        The F-statistic measures how strongly {pairInstruments.length > 1 ? `instruments (${pairInstruments.join(', ')})` : `the instrument (${pairInstruments[0]})`} predict{pairInstruments.length === 1 ? 's' : ''} the treatment variable{' '}
                        <strong>{endoVar}</strong>. Think of it as a signal-to-noise ratio —
                        higher is better. The conventional threshold of F &gt; 10 (or ideally &gt; 16)
                        ensures the instrument provides enough information to produce reliable 2SLS estimates.
                        {pairIsWeak ? ' With weak instruments, the 2SLS estimate can be biased toward the regular (OLS) estimate, which defeats the purpose of IV.' : ''}
                      </p>
                    </div>

                    <div style={styles.thresholdGrid}>
                      <div style={styles.thresholdItem}>
                        <span style={styles.thresholdLabel}>
                          Stock-Yogo threshold (10% max size distortion):
                        </span>
                        <span style={styles.thresholdValue}>
                          {si.stock_yogo_threshold?.toFixed(2)}
                        </span>
                      </div>
                      <div style={styles.thresholdItem}>
                        <span style={styles.thresholdLabel}>Rule-of-thumb threshold:</span>
                        <span style={styles.thresholdValue}>{si.rule_of_thumb_threshold}</span>
                      </div>
                      <div style={styles.thresholdItem}>
                        <span style={styles.thresholdLabel}>First-stage R²:</span>
                        <span style={styles.thresholdValue}>{fs.r_squared?.toFixed(4)}</span>
                      </div>
                      <div style={styles.thresholdItem}>
                        <span style={styles.thresholdLabel}>Partial R² (instruments only):</span>
                        <span style={styles.thresholdValue}>{fs.r_squared_partial?.toFixed(4)}</span>
                      </div>
                    </div>

                    {/* Instrument coefficients */}
                    {fs.instrument_coefficients &&
                      Object.keys(fs.instrument_coefficients).length > 0 && (
                        <div style={{ marginTop: '16px' }}>
                          <p style={styles.subSectionTitle}>
                            Instrument Coefficients (First Stage)
                          </p>
                          <div style={styles.coefTable}>
                            <div style={styles.coefHeader}>
                              <span>Instrument</span>
                              <span title="How much the instrument shifts the treatment variable">Effect on Treatment</span>
                              <span title="Standard Error — measures precision of the estimate">Precision (SE)</span>
                              <span title="t-statistic — effect divided by its precision">t-stat</span>
                              <span title="Probability this effect is due to chance">p-value</span>
                            </div>
                            {Object.entries(fs.instrument_coefficients).map(([name, coef]: [string, any]) => (
                              <div key={name} style={styles.coefRow}>
                                <span style={styles.coefName}>{name}</span>
                                <span>{coef.coefficient?.toFixed(4)}</span>
                                <span>{coef.se?.toFixed(4)}</span>
                                <span>{coef.t_stat?.toFixed(3)}</span>
                                <span style={{
                                  color: coef.p_value < 0.05 ? '#155724' : '#666',
                                  fontWeight: coef.p_value < 0.05 ? '600' : 'normal',
                                }}>
                                  {formatPValue(coef.p_value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                );
              })}

              {/* ── Endogeneity Test (Wu-Hausman) ── */}
              {res.endogeneity_test && (
                <div style={styles.infoCard}>
                  <h3 style={styles.infoTitle}>
                    Endogeneity Test (Wu-Hausman)
                  </h3>
                  <div style={styles.testRow}>
                    <div>
                      <span style={styles.testStatLabel}>Test Statistic: </span>
                      <span style={styles.testStatValue}>
                        {res.endogeneity_test.statistic?.toFixed(4)}
                      </span>
                    </div>
                    <div>
                      <span style={styles.testStatLabel}>p-value: </span>
                      <span
                        style={{
                          ...styles.testStatValue,
                          color:
                            res.endogeneity_test.p_value < 0.05
                              ? '#155724'
                              : '#666',
                        }}
                      >
                        {formatPValue(res.endogeneity_test.p_value)}
                      </span>
                    </div>
                    <div
                      style={{
                        ...styles.testVerdict,
                        backgroundColor: res.endogeneity_test.is_endogenous
                          ? '#d4edda'
                          : '#f8d7da',
                        color: res.endogeneity_test.is_endogenous
                          ? '#155724'
                          : '#721c24',
                      }}
                    >
                      {res.endogeneity_test.is_endogenous
                        ? 'Endogeneity confirmed — IV is justified'
                        : 'No significant endogeneity — OLS may suffice'}
                    </div>
                  </div>
                  <div style={{ ...styles.plainEnglishBox, marginTop: '12px' }}>
                    <span style={styles.plainEnglishLabel}>What this means</span>
                    <p style={styles.plainEnglishText}>
                      <strong>Endogeneity</strong> means the treatment variable is correlated with
                      hidden factors that also affect the outcome — making standard regression results
                      misleading. This test (Wu-Hausman) checks whether that problem exists in your data.
                      {res.endogeneity_test.is_endogenous
                        ? ' The result confirms endogeneity is present, which means using IV (rather than standard regression) is the right approach here.'
                        : ' The result does not find strong evidence of endogeneity, so standard regression might also produce valid estimates — though IV is still valid to use.'}
                    </p>
                  </div>
                  <p style={{ ...styles.testExplanation, marginTop: '8px', color: '#888', fontSize: '12px' }}>
                    <strong>Technical note:</strong> {res.endogeneity_test.message ||
                      'The Wu-Hausman test checks whether the treatment variable is endogenous. A significant result (p < 0.05) means OLS would be biased and IV estimation is justified.'}
                  </p>
                </div>
              )}

              {/* ── Over-identification Test (Sargan-Hansen) ── */}
              {overidApplicable ? (
                <div style={styles.infoCard}>
                  <h3 style={styles.infoTitle}>
                    Over-identification Test (Sargan-Hansen)
                  </h3>
                  <div style={styles.testRow}>
                    <div>
                      <span style={styles.testStatLabel}>J Statistic: </span>
                      <span style={styles.testStatValue}>
                        {overid.statistic?.toFixed(4)}
                      </span>
                    </div>
                    <div>
                      <span style={styles.testStatLabel}>p-value: </span>
                      <span
                        style={{
                          ...styles.testStatValue,
                          color: overid.p_value < 0.05 ? '#721c24' : '#155724',
                        }}
                      >
                        {formatPValue(overid.p_value)}
                      </span>
                    </div>
                    <div>
                      <span style={styles.testStatLabel}>
                        Over-id restrictions:{' '}
                      </span>
                      <span style={styles.testStatValue}>
                        {overid.n_overidentifying_restrictions}
                      </span>
                    </div>
                    <div
                      style={{
                        ...styles.testVerdict,
                        backgroundColor: overid.is_overidentified_rejected
                          ? '#f8d7da'
                          : '#d4edda',
                        color: overid.is_overidentified_rejected
                          ? '#721c24'
                          : '#155724',
                      }}
                    >
                      {overid.is_overidentified_rejected
                        ? '✗ Exclusion restrictions rejected — some instruments may be invalid'
                        : 'Exclusion restrictions not rejected — instruments appear valid'}
                    </div>
                  </div>
                  <div style={{ ...styles.plainEnglishBox, marginTop: '12px' }}>
                    <span style={styles.plainEnglishLabel}>📖 What this means</span>
                    <p style={styles.plainEnglishText}>
                      When you use more instruments than strictly needed, this test checks whether
                      all instruments are consistent with each other. If one instrument were directly
                      affecting the outcome (violating the "exclusion restriction"), it would show up
                      here as a failed test.
                      {overid.is_overidentified_rejected
                        ? ' The test failed (p < 0.05), which raises concerns about the validity of at least one instrument. Consider reviewing which instruments you included.'
                        : ' The test passed (p ≥ 0.05), which is a good sign — your instruments appear to be working through the treatment variable only.'}
                    </p>
                  </div>
                  <p style={{ ...styles.testExplanation, marginTop: '8px', color: '#888', fontSize: '12px' }}>
                    <strong>Technical note:</strong> {overid.message ||
                      'The Sargan-Hansen J-test checks whether over-identifying restrictions are satisfied. Rejection (p < 0.05) suggests some instruments may violate the exclusion restriction.'}
                  </p>
                </div>
              ) : overid?.not_applicable ? (
                <div style={styles.infoCardMuted}>
                  <h3 style={styles.infoTitle}>
                    Over-identification Test (Sargan-Hansen)
                  </h3>
                  <p style={styles.mutedNote}>
                    {overid.reason ||
                      'Not applicable for just-identified IV (1 instrument = 1 endogenous variable). The Sargan-Hansen test requires more instruments than endogenous variables.'}
                  </p>
                </div>
              ) : null}

              {/* ── OLS vs 2SLS Interactive Chart ── */}
              {res.ols_comparison && (() => {
                const olsEst = res.ols_comparison.estimate ?? 0;
                const slsEst = res.treatment_effect ?? 0;
                const olsSe = res.ols_comparison.se ?? 0;
                const slsSe = res.se ?? 0;
                const diff = slsEst - olsEst;
                const absDiff = Math.abs(diff);
                const pctDiff = olsEst
                  ? (absDiff / Math.abs(olsEst)) * 100
                  : null;

                const chartData = [
                  {
                    name: chartOlsLabel,
                    estimate: olsEst,
                    errorY: [olsSe * 1.96, olsSe * 1.96] as [number, number],
                    ciLower: res.ols_comparison.ci_lower,
                    ciUpper: res.ols_comparison.ci_upper,
                    se: olsSe,
                    color: '#FF6B6B',
                  },
                  {
                    name: chart2slsLabel,
                    estimate: slsEst,
                    errorY: [slsSe * 1.96, slsSe * 1.96] as [number, number],
                    ciLower: res.ci_lower,
                    ciUpper: res.ci_upper,
                    se: slsSe,
                    color: '#4F9CF9',
                  },
                ];

                const EditableLabel: React.FC<{
                  field: string;
                  value: string;
                  onChange: (v: string) => void;
                  style?: React.CSSProperties;
                  inputStyle?: React.CSSProperties;
                }> = ({ field, value, onChange, style, inputStyle }) =>
                  editingChartField === field ? (
                    <input
                      autoFocus
                      value={value}
                      onChange={e => onChange(e.target.value)}
                      onBlur={() => setEditingChartField(null)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === 'Escape')
                          setEditingChartField(null);
                      }}
                      style={{
                        border: 'none',
                        borderBottom: '2px solid #4F9CF9',
                        background: 'transparent',
                        outline: 'none',
                        textAlign: 'center',
                        padding: '2px 4px',
                        fontFamily: 'inherit',
                        ...inputStyle,
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => setEditingChartField(field)}
                      title="Click to edit"
                      style={{
                        cursor: 'text',
                        borderBottom: '1px dashed #b3d0ff',
                        paddingBottom: '1px',
                        ...style,
                      }}
                    >
                      {value}
                    </span>
                  );

                const CustomTooltip = ({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{
                      background: '#fff', border: '1px solid #e9ecef',
                      borderRadius: '8px', padding: '10px 14px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      fontSize: '13px', minWidth: '180px',
                    }}>
                      <p style={{ fontWeight: 700, marginBottom: '6px', color: d.color }}>{d.name}</p>
                      <p style={{ margin: '3px 0', color: '#444' }}>Estimate: <strong>{d.estimate?.toFixed(4)}</strong></p>
                      <p style={{ margin: '3px 0', color: '#888' }}>SE: {d.se?.toFixed(4)}</p>
                      <p style={{ margin: '3px 0', color: '#888' }}>
                        95% CI: [{d.ciLower?.toFixed(3)}, {d.ciUpper?.toFixed(3)}]
                      </p>
                    </div>
                  );
                };

                return (
                  <div style={styles.infoCard}>
                    {/* Header row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <div>
                        <h3 style={{ ...styles.infoTitle, marginBottom: '4px' }}>OLS vs. 2SLS Comparison</h3>
                        <p style={styles.infoSubtitle}>
                          The difference between OLS and 2SLS estimates reflects the
                          degree of endogeneity bias corrected by IV.
                        </p>
                      </div>
                      <button
                        onClick={downloadChart}
                        title="Download chart as PNG"
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '7px 14px', borderRadius: '8px',
                          border: '1px solid #d0dff5', background: '#f0f7ff',
                          color: '#043873', fontSize: '13px', fontWeight: 600,
                          cursor: 'pointer', flexShrink: 0, marginLeft: '16px',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#dceeff')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#f0f7ff')}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Download PNG
                      </button>
                    </div>

                    {/* Chart */}
                    <div ref={chartRef} style={{ background: '#fff', padding: '20px 8px 12px', borderRadius: '10px', border: '1px solid #f0f0f0', marginTop: '12px' }}>
                      {/* Editable chart title */}
                      <div style={{ textAlign: 'center', marginBottom: '4px' }}>
                        <EditableLabel
                          field="title"
                          value={chartTitle}
                          onChange={setChartTitle}
                          style={{ fontSize: '14px', fontWeight: 700, color: '#222' }}
                          inputStyle={{ fontSize: '14px', fontWeight: 700, color: '#222', width: '340px' }}
                        />
                      </div>

                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart
                          data={chartData}
                          margin={{ top: 20, right: 40, left: 20, bottom: 30 }}
                          barCategoryGap="40%"
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 13, fill: '#444' }}
                            label={{
                              value: chartXLabel,
                              position: 'insideBottom',
                              offset: -16,
                              style: { fontSize: 12, fill: '#888' },
                            }}
                          />
                          <YAxis
                            tick={{ fontSize: 12, fill: '#888' }}
                            label={{
                              value: chartYLabel,
                              angle: -90,
                              position: 'insideLeft',
                              offset: 10,
                              style: { fontSize: 12, fill: '#888' },
                            }}
                          />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                          <ReferenceLine y={0} stroke="#999" strokeDasharray="4 2" />
                          <Bar dataKey="estimate" radius={[6, 6, 0, 0]} maxBarSize={80}>
                            {chartData.map((entry, index) => (
                              <Cell key={index} fill={entry.color} />
                            ))}
                            <ErrorBar dataKey="errorY" width={8} strokeWidth={2} stroke="#444" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>

                      {/* Editable axis label hints */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', padding: '0 8px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: '#aaa' }}>Y-axis:</span>
                          <EditableLabel
                            field="ylabel"
                            value={chartYLabel}
                            onChange={setChartYLabel}
                            style={{ fontSize: '11px', color: '#888' }}
                            inputStyle={{ fontSize: '11px', color: '#888', width: '120px' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: '#aaa' }}>X-axis:</span>
                          <EditableLabel
                            field="xlabel"
                            value={chartXLabel}
                            onChange={setChartXLabel}
                            style={{ fontSize: '11px', color: '#888' }}
                            inputStyle={{ fontSize: '11px', color: '#888', width: '100px' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: '#aaa' }}>Bar labels:</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '10px', height: '10px', background: '#FF6B6B', borderRadius: '2px', display: 'inline-block' }} />
                            <EditableLabel
                              field="olslabel"
                              value={chartOlsLabel}
                              onChange={setChartOlsLabel}
                              style={{ fontSize: '11px', color: '#888' }}
                              inputStyle={{ fontSize: '11px', color: '#888', width: '60px' }}
                            />
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '10px', height: '10px', background: '#4F9CF9', borderRadius: '2px', display: 'inline-block' }} />
                            <EditableLabel
                              field="slslabel"
                              value={chart2slsLabel}
                              onChange={setChart2slsLabel}
                              style={{ fontSize: '11px', color: '#888' }}
                              inputStyle={{ fontSize: '11px', color: '#888', width: '60px' }}
                            />
                          </span>
                        </div>
                      </div>
                      <p style={{ textAlign: 'center', fontSize: '10px', color: '#ccc', marginTop: '6px' }}>
                        Error bars show ±1.96 SE &nbsp;·&nbsp; Click any label above to edit &nbsp;·&nbsp; Generated by Causal Platform
                      </p>
                    </div>

                    {/* Bias correction note */}
                    <p style={styles.biasCorrectionNote}>
                      <strong>Bias correction:</strong> 2SLS corrects{' '}
                      {diff > 0 ? 'upward' : 'downward'} by {absDiff.toFixed(4)}
                      {pctDiff != null ? ` (${pctDiff.toFixed(1)}% relative to OLS)` : ''}.
                      A large difference suggests substantial endogeneity in the OLS estimate.
                    </p>

                    {/* Compact numeric summary */}
                    <div style={styles.comparisonGrid}>
                      <div style={styles.comparisonItem}>
                        <div style={styles.comparisonLabel}>OLS Estimate</div>
                        <div style={styles.comparisonValue}>{olsEst.toFixed(4)}</div>
                        <div style={styles.comparisonSub}>
                          SE: {olsSe.toFixed(4)} &nbsp;|&nbsp; 95% CI: [{res.ols_comparison.ci_lower?.toFixed(3)}, {res.ols_comparison.ci_upper?.toFixed(3)}]
                        </div>
                      </div>
                      <div style={styles.comparisonArrow}>→</div>
                      <div style={{ ...styles.comparisonItem, borderColor: '#043873', backgroundColor: '#f0f7ff' }}>
                        <div style={styles.comparisonLabel}>2SLS Estimate</div>
                        <div style={{ ...styles.comparisonValue, color: '#043873' }}>{slsEst.toFixed(4)}</div>
                        <div style={styles.comparisonSub}>
                          SE: {slsSe.toFixed(4)} &nbsp;|&nbsp; 95% CI: [{res.ci_lower?.toFixed(3)}, {res.ci_upper?.toFixed(3)}]
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── Sensitivity Analysis ── */}
              <div style={styles.infoCard}>
                <h3 style={styles.infoTitle}>Sensitivity Analysis</h3>
                {sensitivity && !sensitivity.error && (sensitivity.anderson_rubin_ci || (sensitivity.leave_one_out && sensitivity.leave_one_out.length > 0)) ? (
                  <>
                    {sensitivity.anderson_rubin_ci && (() => {
                      const ar = sensitivity.anderson_rubin_ci;
                      const arLow = ar.ci_lower ?? null;
                      const arHigh = ar.ci_upper ?? null;
                      const tsls2Low = ar.tsls_ci_lower ?? res.ci_lower ?? null;
                      const tsls2High = ar.tsls_ci_upper ?? res.ci_upper ?? null;
                      // Build a shared visual scale
                      const allVals = [arLow, arHigh, tsls2Low, tsls2High].filter((v): v is number => v !== null);
                      const rangeMin = allVals.length ? Math.min(...allVals) : -1;
                      const rangeMax = allVals.length ? Math.max(...allVals) : 1;
                      const pad = Math.max((rangeMax - rangeMin) * 0.25, 0.05);
                      const scaleMin = rangeMin - pad;
                      const scaleMax = rangeMax + pad;
                      const scaleRange = scaleMax - scaleMin || 1;
                      const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - scaleMin) / scaleRange) * 100)).toFixed(1)}%`;
                      const zeroPct = pct(0);
                      const arWidth = (arHigh !== null && arLow !== null) ? `${((arHigh - arLow) / scaleRange * 100).toFixed(1)}%` : '0%';
                      const tsls2Width = (tsls2High !== null && tsls2Low !== null) ? `${((tsls2High - tsls2Low) / scaleRange * 100).toFixed(1)}%` : '0%';
                      const arWider = (arHigh !== null && arLow !== null && tsls2High !== null && tsls2Low !== null)
                        ? (arHigh - arLow) > (tsls2High - tsls2Low) * 1.2
                        : false;
                      return (
                        <div style={{ marginBottom: '24px' }}>
                          <p style={styles.subSectionTitle}>
                            Anderson-Rubin Confidence Interval
                            <span style={styles.subSectionNote}> — weak-instrument robust</span>
                          </p>

                          {/* Plain-language summary */}
                          <div style={{ ...styles.plainEnglishBox, marginBottom: '20px' }}>
                            <span style={styles.plainEnglishLabel}>What this shows</span>
                            <p style={styles.plainEnglishText}>
                              The <strong>Anderson-Rubin (AR) CI</strong> is a robust confidence interval that remains valid even when instruments are weak.
                              The <strong>2SLS CI</strong> (standard) can be too narrow when instruments are weak, giving a false sense of precision.
                              {arWider
                                ? ' The AR interval is noticeably wider than the 2SLS interval — this suggests weak instruments are a real concern and you should rely on the AR CI.'
                                : ' The AR and 2SLS intervals are similar in width — your instruments appear sufficiently strong.'}
                            </p>
                          </div>

                          {/* Visual comparison chart */}
                          <div style={{ marginBottom: '20px' }}>
                            <p style={{ ...styles.subSectionTitle, fontSize: '13px', marginBottom: '14px', fontWeight: 600, color: '#555' }}>
                              CI Width Comparison
                            </p>
                            {/* 2SLS bar */}
                            <div style={{ marginBottom: '18px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#043873' }}>2SLS (Wald) CI</span>
                                {tsls2Low !== null && tsls2High !== null && (
                                  <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#043873' }}>
                                    [{tsls2Low.toFixed(4)}, {tsls2High.toFixed(4)}]
                                  </span>
                                )}
                              </div>
                              <div style={{ position: 'relative', height: '22px', backgroundColor: '#e9ecef', borderRadius: '4px', overflow: 'hidden' }}>
                                {/* zero line */}
                                <div style={{ position: 'absolute', left: zeroPct, top: 0, bottom: 0, width: '1px', backgroundColor: '#aaa', zIndex: 2 }} />
                                {tsls2Low !== null && tsls2High !== null && (
                                  <div style={{ position: 'absolute', left: pct(tsls2Low), width: tsls2Width, top: '3px', bottom: '3px', backgroundColor: '#4F9CF9', borderRadius: '3px', opacity: 0.85 }} />
                                )}
                              </div>
                            </div>
                            {/* AR bar */}
                            <div style={{ marginBottom: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: arWider ? '#b45309' : '#059669' }}>AR CI (robust)</span>
                                {arLow !== null && arHigh !== null && (
                                  <span style={{ fontSize: '12px', fontFamily: 'monospace', color: arWider ? '#b45309' : '#059669' }}>
                                    [{arLow.toFixed(4)}, {arHigh.toFixed(4)}]
                                  </span>
                                )}
                              </div>
                              <div style={{ position: 'relative', height: '22px', backgroundColor: '#e9ecef', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', left: zeroPct, top: 0, bottom: 0, width: '1px', backgroundColor: '#aaa', zIndex: 2 }} />
                                {arLow !== null && arHigh !== null && (
                                  <div style={{ position: 'absolute', left: pct(arLow), width: arWidth, top: '3px', bottom: '3px', backgroundColor: arWider ? '#f59e0b' : '#10b981', borderRadius: '3px', opacity: 0.85 }} />
                                )}
                              </div>
                            </div>
                            {/* Scale labels */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#999', marginTop: '4px' }}>
                              <span>{scaleMin.toFixed(3)}</span>
                              <span>0</span>
                              <span>{scaleMax.toFixed(3)}</span>
                            </div>
                          </div>

                          {/* Summary verdict */}
                          <div style={{
                            padding: '10px 14px', borderRadius: '8px',
                            backgroundColor: arWider ? '#fffbeb' : '#f0fdf4',
                            border: `1px solid ${arWider ? '#fde68a' : '#bbf7d0'}`,
                            fontSize: '13px', color: arWider ? '#92400e' : '#065f46',
                          }}>
                            {arWider
                              ? 'The AR interval is wider than the 2SLS interval. Rely on the AR CI — your 2SLS CI may understate uncertainty due to weak instruments.'
                              : 'The AR and 2SLS intervals are similar. Your instruments appear strong enough that both CIs agree.'}
                          </div>
                        </div>
                      );
                    })()}

                    {sensitivity.leave_one_out &&
                      sensitivity.leave_one_out.length > 0 && (() => {
                        const estimates = sensitivity.leave_one_out
                          .filter((r: any) => r.estimate != null)
                          .map((r: any) => r.estimate as number);
                        const mainEffect = res.treatment_effect ?? 0;
                        const allVals2 = [mainEffect, ...estimates, ...sensitivity.leave_one_out.flatMap((r: any) => [r.ci_lower, r.ci_upper]).filter((v: any) => v != null)];
                        const lo2 = Math.min(...allVals2);
                        const hi2 = Math.max(...allVals2);
                        const pad2 = Math.max((hi2 - lo2) * 0.15, 0.02);
                        const s2Min = lo2 - pad2;
                        const s2Max = hi2 + pad2;
                        const s2Range = s2Max - s2Min || 1;
                        const pct2 = (v: number) => `${Math.max(0, Math.min(100, ((v - s2Min) / s2Range) * 100)).toFixed(1)}%`;
                        const stable = sensitivity.stable;
                        return (
                          <div>
                            <p style={styles.subSectionTitle}>Leave-One-Out Instrument Sensitivity</p>
                            <div style={{ ...styles.plainEnglishBox, marginBottom: '16px' }}>
                              <span style={styles.plainEnglishLabel}>What this shows</span>
                              <p style={styles.plainEnglishText}>
                                Each row drops one instrument and re-estimates the model. If results change drastically when any single instrument is removed, the main estimate may depend heavily on that instrument's validity.
                                {stable === true && ' Results appear stable across all dropped-instrument specifications.'}
                                {stable === false && ' Results vary noticeably — the main estimate may be sensitive to which instruments are included.'}
                              </p>
                            </div>

                            {/* Dot-plot of leave-one-out estimates */}
                            <div style={{ marginBottom: '16px' }}>
                              <p style={{ fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '10px' }}>Effect estimates across specifications</p>
                              {/* Full-model reference line row */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                <span style={{ fontSize: '12px', color: '#043873', fontWeight: 600, width: '160px', flexShrink: 0 }}>Full model</span>
                                <div style={{ flex: 1, position: 'relative', height: '24px' }}>
                                  <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', backgroundColor: '#e2e8f0' }} />
                                  <div style={{ position: 'absolute', left: pct2(0), top: 0, bottom: 0, width: '1px', backgroundColor: '#ccc' }} />
                                  <div style={{ position: 'absolute', left: pct2(mainEffect), top: '50%', transform: 'translate(-50%,-50%)', width: '10px', height: '10px', backgroundColor: '#043873', borderRadius: '50%' }} />
                                </div>
                                <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#043873', fontWeight: 600, width: '70px', textAlign: 'right' as const }}>{mainEffect.toFixed(4)}</span>
                                <span style={{ fontSize: '11px', color: '#888', width: '60px', textAlign: 'right' as const }}>p = {formatPValue(res.p_value)}</span>
                              </div>
                              {sensitivity.leave_one_out.map((row: any, i: number) => {
                                if (row.error) return (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', opacity: 0.6 }}>
                                    <span style={{ fontSize: '12px', color: '#666', width: '160px', flexShrink: 0 }}>Drop {row.dropped_instrument}</span>
                                    <span style={{ fontSize: '12px', color: '#999', fontStyle: 'italic' }}>{row.error}</span>
                                  </div>
                                );
                                const shifted = Math.abs((row.estimate - mainEffect) / (Math.abs(mainEffect) || 1)) > 0.15;
                                return (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', color: '#444', width: '160px', flexShrink: 0 }}>Drop {row.dropped_instrument}</span>
                                    <div style={{ flex: 1, position: 'relative', height: '24px' }}>
                                      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', backgroundColor: '#e2e8f0' }} />
                                      <div style={{ position: 'absolute', left: pct2(0), top: 0, bottom: 0, width: '1px', backgroundColor: '#ccc' }} />
                                      {/* CI whisker */}
                                      {row.ci_lower != null && row.ci_upper != null && (
                                        <div style={{ position: 'absolute', left: pct2(row.ci_lower), width: `calc(${pct2(row.ci_upper)} - ${pct2(row.ci_lower)})`, top: '50%', height: '2px', backgroundColor: shifted ? '#f59e0b' : '#10b981', transform: 'translateY(-50%)', opacity: 0.6 }} />
                                      )}
                                      {/* Estimate dot */}
                                      <div style={{ position: 'absolute', left: pct2(row.estimate), top: '50%', transform: 'translate(-50%,-50%)', width: '9px', height: '9px', backgroundColor: shifted ? '#f59e0b' : '#10b981', borderRadius: '50%', border: '1px solid white' }} />
                                    </div>
                                    <span style={{ fontSize: '12px', fontFamily: 'monospace', color: shifted ? '#b45309' : '#444', fontWeight: shifted ? 600 : 'normal', width: '70px', textAlign: 'right' as const }}>{row.estimate?.toFixed(4)}</span>
                                    <span style={{ fontSize: '11px', color: row.p_value < 0.05 ? '#059669' : '#888', width: '60px', textAlign: 'right' as const }}>p = {formatPValue(row.p_value)}</span>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Stability verdict */}
                            <div style={{
                              padding: '10px 14px', borderRadius: '8px',
                              backgroundColor: stable === false ? '#fffbeb' : '#f0fdf4',
                              border: `1px solid ${stable === false ? '#fde68a' : '#bbf7d0'}`,
                              fontSize: '13px', color: stable === false ? '#92400e' : '#065f46',
                            }}>
                              {sensitivity.stability_message || (stable === true ? 'Estimates are stable across dropped-instrument specifications.' : 'Not enough results to assess stability.')}
                            </div>

                            {/* Detail table (collapsed/compact) */}
                            <div style={{ marginTop: '16px' }}>
                              <p style={{ ...styles.subSectionTitle, fontSize: '12px', color: '#888', marginBottom: '8px' }}>Detailed table</p>
                              <div style={styles.louTable}>
                                <div style={styles.louHeader}>
                                  <span>Dropped Instrument</span>
                                  <span>2SLS Estimate</span>
                                  <span>SE</span>
                                  <span>p-value</span>
                                  <span>CI</span>
                                </div>
                                {sensitivity.leave_one_out.map((row: any, i: number) => (
                                  <div key={i} style={styles.louRow}>
                                    <span style={{ fontWeight: '500' as const }}>{row.dropped_instrument}</span>
                                    <span>{row.estimate?.toFixed(4)}</span>
                                    <span>{row.se?.toFixed(4)}</span>
                                    <span style={{ color: row.p_value < 0.05 ? '#155724' : '#666' }}>
                                      {formatPValue(row.p_value)}
                                    </span>
                                    <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                                      [{row.ci_lower?.toFixed(3)}, {row.ci_upper?.toFixed(3)}]
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                  </>
                ) : (
                  <p style={styles.mutedNote}>
                    {sensitivity?.error
                      ? `Sensitivity analysis failed: ${sensitivity.error}`
                      : 'Sensitivity analysis was not run for this analysis. Re-run the analysis from the IV setup page with "Run sensitivity analysis" checked to see the Anderson-Rubin confidence interval (just-identified) or leave-one-out instrument sensitivity (overidentified).'}
                  </p>
                )}
              </div>

              {/* ── Warnings ── */}
              {res.warnings && res.warnings.length > 0 && (
                <div style={styles.warningCard}>
                  <h3 style={styles.warningTitle}>Warnings</h3>
                  <ul style={styles.warningList}>
                    {res.warnings.map((w: string, i: number) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Reproducible Code Section ── */}
              <div style={styles.codeSection}>
                <div style={styles.codeSectionHeader}>
                  <h2 style={styles.sectionTitle}>Reproduce This Analysis</h2>
                  <button
                    onClick={() => setShowCode(!showCode)}
                    style={styles.codeToggleButton}
                  >
                    {showCode ? '▲ Hide Code' : '▼ Show Code'}
                  </button>
                </div>
                {showCode && (
                  <div style={styles.codeContent}>
                    <p style={styles.codeDescription}>
                      Use the code below to replicate this analysis and visualizations in your own environment.
                    </p>
                    <div style={styles.languageTabs}>
                      <button
                        onClick={() => setCodeLanguage('python')}
                        style={{
                          ...styles.languageTab,
                          ...(codeLanguage === 'python' ? styles.languageTabActive : {}),
                        }}
                      >
                        Python
                      </button>
                      <button
                        onClick={() => setCodeLanguage('r')}
                        style={{
                          ...styles.languageTab,
                          ...(codeLanguage === 'r' ? styles.languageTabActive : {}),
                        }}
                      >
                        R
                      </button>
                      <button
                        onClick={() => setCodeLanguage('stata')}
                        style={{
                          ...styles.languageTab,
                          ...(codeLanguage === 'stata' ? styles.languageTabActive : {}),
                        }}
                      >
                        Stata
                      </button>
                    </div>
                    <div style={styles.codeBlock}>
                      <div style={styles.codeBlockHeader}>
                        <span style={styles.codeBlockTitle}>
                          {codeLanguage === 'python' ? 'Python (linearmodels + statsmodels)' : codeLanguage === 'r' ? 'R (AER + estimatr)' : 'Stata (ivregress 2sls)'}
                        </span>
                        <button
                          onClick={() => {
                            const code = codeLanguage === 'python' ? generatePythonCode() : codeLanguage === 'r' ? generateRCode() : generateStataCode();
                            navigator.clipboard.writeText(code);
                            alert('Code copied to clipboard!');
                          }}
                          style={styles.copyButton}
                        >
                          Copy Code
                        </button>
                      </div>
                      <pre style={styles.codeText}>
                        <code>{codeLanguage === 'python' ? generatePythonCode() : codeLanguage === 'r' ? generateRCode() : generateStataCode()}</code>
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── AI Sidebar ── */}
          {!isAiSidebarCollapsed && (
            <div
              style={{
                ...styles.aiSidebar,
                width: `${aiSidebarWidth}px`,
                flex: `0 0 ${aiSidebarWidth}px`,
                position: 'sticky' as const,
                top: '90px',
                marginTop: '90px',
                maxHeight: 'calc(100vh - 200px)',
              }}
            >
              {/* Resize handle */}
              <div
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsResizing(true);
                }}
                style={{
                  position: 'absolute',
                  left: '-4px',
                  top: 0,
                  bottom: 0,
                  width: '8px',
                  cursor: 'col-resize',
                  zIndex: 10,
                  backgroundColor: isResizing
                    ? 'rgba(79,156,249,0.3)'
                    : 'transparent',
                  borderLeft: isResizing ? '2px solid #4F9CF9' : 'none',
                }}
              />

              <div
                style={{
                  ...styles.aiSection,
                  maxHeight: 'calc(100vh - 200px)',
                  overflowY: 'auto' as const,
                  boxSizing: 'border-box' as const,
                }}
              >
                {/* AI Interpretation */}
                <div style={styles.aiSectionHeader}>
                  <h2 style={styles.sectionTitle}>
                    🤖 AI-Powered Interpretation
                  </h2>
                  {!aiInterpretation && !loadingAI && (
                    <button
                      onClick={loadAIInterpretation}
                      style={styles.getAiButton}
                      disabled={loadingAI}
                    >
                      ✨ Get AI Interpretation
                    </button>
                  )}
                </div>

                {loadingAI && (
                  <div style={styles.aiLoading}>
                    <div style={styles.aiSpinner}></div>
                    <p>AI is analyzing your results...</p>
                  </div>
                )}

                {aiError && !loadingAI && (
                  <div style={styles.aiError}>
                        <p>{aiError}</p>
                    <p style={styles.aiErrorNote}>
                      Your results are still valid. AI interpretation is
                      temporarily unavailable.
                    </p>
                    {!aiError.includes('quota exceeded') && (
                      <button
                        onClick={() => {
                          setAiError(null);
                          loadAIInterpretation();
                        }}
                        style={styles.retryButton}
                      >
                        Try Again
                      </button>
                    )}
                  </div>
                )}

                {!loadingAI && !aiInterpretation && !aiError && (
                  <div style={styles.aiPrompt}>
                    <h3 style={styles.aiPromptTitle}>Get Expert Analysis</h3>
                    <p style={styles.aiPromptText}>
                      Click above to get AI insights: executive summary, effect
                      size interpretation, instrument validity assessment,
                      limitations, and practical implications.
                    </p>
                  </div>
                )}

                {aiInterpretation && !loadingAI && (
                  <>
                    <div style={styles.aiCard}>
                      <h3 style={styles.aiCardTitle}>Executive Summary</h3>
                      <p style={styles.aiText}>
                        {aiInterpretation.executive_summary}
                      </p>
                    </div>
                    {aiInterpretation.parallel_trends_interpretation && (
                      <div style={styles.aiCard}>
                        <h3 style={styles.aiCardTitle}>
                          Instrument Validity Assessment
                        </h3>
                        <p style={styles.aiText}>
                          {aiInterpretation.parallel_trends_interpretation}
                        </p>
                      </div>
                    )}
                    {aiInterpretation.effect_size_interpretation && (
                      <div style={styles.aiCard}>
                        <h3 style={styles.aiCardTitle}>Effect Size</h3>
                        <p style={styles.aiText}>
                          {aiInterpretation.effect_size_interpretation}
                        </p>
                      </div>
                    )}
                    {aiInterpretation.statistical_interpretation && (
                      <div style={styles.aiCard}>
                        <h3 style={styles.aiCardTitle}>
                          Statistical Significance
                        </h3>
                        <p style={styles.aiText}>
                          {aiInterpretation.statistical_interpretation}
                        </p>
                      </div>
                    )}
                    {aiInterpretation.limitations &&
                      aiInterpretation.limitations.length > 0 && (
                        <div
                          style={{ ...styles.aiCard, ...styles.aiCardWarning }}
                        >
                          <h3 style={styles.aiCardTitle}>
                            Limitations & Caveats
                          </h3>
                          <ul style={styles.aiList}>
                            {aiInterpretation.limitations.map((l, i) => (
                              <li key={i} style={styles.aiListItem}>
                                {l}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    {aiInterpretation.implications &&
                      aiInterpretation.implications.length > 0 && (
                        <div
                          style={{ ...styles.aiCard, ...styles.aiCardSuccess }}
                        >
                          <h3 style={styles.aiCardTitle}>
                            Practical Implications
                          </h3>
                          <ul style={styles.aiList}>
                            {aiInterpretation.implications.map((imp, i) => (
                              <li key={i} style={styles.aiListItem}>
                                {imp}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    {aiInterpretation.next_steps &&
                      aiInterpretation.next_steps.length > 0 && (
                        <div
                          style={{
                            ...styles.aiCard,
                            ...styles.aiCardNextSteps,
                          }}
                        >
                          <h3 style={styles.aiCardTitle}>
                            Recommended Next Steps
                          </h3>
                          <ul style={styles.aiList}>
                            {aiInterpretation.next_steps.map((step, i) => (
                              <li key={i} style={styles.aiListItem}>
                                <span style={styles.stepNumber}>{i + 1}</span>
                                {step}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    {aiInterpretation.recommendation && (
                      <div
                        style={{
                          ...styles.aiCard,
                          ...styles.aiCardRecommendation,
                        }}
                      >
                        <h3 style={styles.aiCardTitle}>Bottom Line</h3>
                        <p style={styles.aiText}>
                          {aiInterpretation.recommendation}
                        </p>
                        {aiInterpretation.confidence_level && (
                          <p style={styles.confidenceLevel}>
                            Analysis Confidence:{' '}
                            <strong
                              style={{
                                color:
                                  aiInterpretation.confidence_level === 'high'
                                    ? '#28a745'
                                    : aiInterpretation.confidence_level ===
                                      'medium'
                                    ? '#ffc107'
                                    : '#dc3545',
                              }}
                            >
                              {aiInterpretation.confidence_level.toUpperCase()}
                            </strong>
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Chat section */}
                <div
                  style={{
                    marginTop: '24px',
                    borderTop: '2px solid #e9ecef',
                    paddingTop: '20px',
                  }}
                >
                  <h3
                    style={{
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: '#043873',
                      margin: '0 0 16px 0',
                    }}
                  >
                    💬 Ask AI
                  </h3>
                  <p
                    style={{
                      fontSize: '13px',
                      color: '#666',
                      marginBottom: '16px',
                      lineHeight: 1.5,
                    }}
                  >
                    Ask questions about your study, dataset, or IV concepts.
                  </p>

                  <div
                    style={{
                      maxHeight: '400px',
                      overflowY: 'auto' as const,
                      marginBottom: '16px',
                      padding: '12px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '8px',
                      border: '1px solid #e9ecef',
                      minHeight: '200px',
                    }}
                  >
                    {chatMessages.length === 0 ? (
                      <div
                        style={{
                          textAlign: 'center' as const,
                          color: '#999',
                          padding: '40px 20px',
                          fontSize: '14px',
                        }}
                      >
                        Start a conversation by asking a question below.
                      </div>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          style={{
                            marginBottom: '16px',
                            display: 'flex',
                            flexDirection: 'column' as const,
                            alignItems:
                              msg.role === 'user' ? 'flex-end' : 'flex-start',
                          }}
                        >
                          <div
                            style={{
                              maxWidth: '85%',
                              padding: '10px 14px',
                              borderRadius: '12px',
                              backgroundColor:
                                msg.role === 'user' ? '#4F9CF9' : '#ffffff',
                              color: msg.role === 'user' ? '#ffffff' : '#333',
                              fontSize: '14px',
                              lineHeight: 1.5,
                              boxShadow:
                                msg.role === 'user'
                                  ? 'none'
                                  : '0 1px 3px rgba(0,0,0,0.1)',
                              border:
                                msg.role === 'user'
                                  ? 'none'
                                  : '1px solid #e9ecef',
                              whiteSpace: 'pre-wrap' as const,
                              wordBreak: 'break-word' as const,
                            }}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ))
                    )}
                    {chatLoading && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          marginBottom: '16px',
                        }}
                      >
                        <div
                          style={{
                            padding: '10px 14px',
                            borderRadius: '12px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #e9ecef',
                            fontSize: '14px',
                            color: '#666',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <div
                            style={{
                              width: '16px',
                              height: '16px',
                              border: '2px solid #f3f3f3',
                              borderTop: '2px solid #4F9CF9',
                              borderRadius: '50%',
                              animation: 'spin 1s linear infinite',
                              marginRight: '8px',
                            }}
                          />
                          <span>AI is thinking...</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatMessagesEndRef} />
                  </div>

                  {chatError && (
                    <div
                      style={{
                        padding: '10px',
                        marginBottom: '12px',
                        backgroundColor: '#f8d7da',
                        color: '#721c24',
                        borderRadius: '6px',
                        fontSize: '13px',
                        border: '1px solid #f5c6cb',
                      }}
                    >
                      {chatError}
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'flex-end',
                    }}
                  >
                    <textarea
                      value={chatInput}
                      onChange={(e) => {
                        if (e.target.value.length <= MAX_MESSAGE_LENGTH) {
                          setChatInput(e.target.value);
                          setChatError(null);
                        }
                      }}
                      onKeyPress={handleChatKeyPress}
                      placeholder="Ask a question about your analysis..."
                      disabled={chatLoading}
                      style={{
                        flex: 1,
                        minHeight: '60px',
                        maxHeight: '120px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #dee2e6',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        resize: 'vertical' as const,
                        outline: 'none',
                        boxSizing: 'border-box' as const,
                      }}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={
                        !chatInput.trim() ||
                        chatLoading ||
                        chatInput.length > MAX_MESSAGE_LENGTH
                      }
                      style={{
                        padding: '10px 20px',
                        backgroundColor:
                          chatInput.trim() &&
                          !chatLoading &&
                          chatInput.length <= MAX_MESSAGE_LENGTH
                            ? '#4F9CF9'
                            : '#ccc',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor:
                          chatInput.trim() &&
                          !chatLoading &&
                          chatInput.length <= MAX_MESSAGE_LENGTH
                            ? 'pointer'
                            : 'not-allowed',
                        fontSize: '14px',
                        fontWeight: 600,
                        height: '60px',
                        minWidth: '80px',
                      }}
                    >
                      {chatLoading ? '...' : 'Send'}
                    </button>
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#999',
                      marginTop: '6px',
                      textAlign: 'right' as const,
                    }}
                  >
                    {chatInput.length}/{MAX_MESSAGE_LENGTH} characters
                  </div>

                  {recommendedQuestions.length > 0 && (
                    <div
                      style={{
                        marginTop: '16px',
                        paddingTop: '16px',
                        borderTop: '1px solid #e9ecef',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '13px',
                          color: '#666',
                          marginBottom: '10px',
                          fontWeight: 500,
                        }}
                      >
                        Suggested questions:
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column' as const,
                          gap: '8px',
                        }}
                      >
                        {recommendedQuestions.map((q, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setChatInput(q);
                              setChatError(null);
                            }}
                            disabled={chatLoading}
                            style={{
                              padding: '10px 14px',
                              backgroundColor: '#f8f9fa',
                              border: '1px solid #dee2e6',
                              borderRadius: '8px',
                              fontSize: '13px',
                              color: '#043873',
                              cursor: chatLoading ? 'not-allowed' : 'pointer',
                              textAlign: 'left' as const,
                              opacity: chatLoading ? 0.6 : 1,
                            }}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Collapsed AI tab */}
          {isAiSidebarCollapsed && (
            <button
              onClick={() => {
                setIsAiSidebarCollapsed(false);
                setAiSidebarWidth(480);
              }}
              style={{
                position: 'fixed',
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                width: '60px',
                height: '220px',
                backgroundColor: '#4F9CF9',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px 0 0 8px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column' as const,
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                boxShadow: '-4px 0 12px rgba(79,156,249,0.3)',
                zIndex: 1000,
                padding: '20px 10px',
              }}
              type="button"
            >
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  letterSpacing: '1px',
                }}
              >
                Open AI section
              </span>
            </button>
          )}
        </div>
      </div>

      <BottomProgressBar
        currentStep={currentStep}
        steps={steps}
        onPrev={goToPreviousStep}
        onNext={goToNextStep}
        canGoNext={false}
        onStepClick={(stepPath) => navigateToStep(stepPath)}
      />
    </div>
  );
};

export default IVResults;

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  contentContainer: {
    paddingTop: '70px',
    paddingBottom: '120px',
    minHeight: 'calc(100vh - 70px)',
    backgroundColor: '#f5f5f5',
  },
  mainLayout: {
    display: 'flex',
    gap: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '20px 10px',
    width: '100%',
    boxSizing: 'border-box' as const,
    alignItems: 'flex-start',
    position: 'relative' as const,
  },
  mainContent: {
    flex: '1 1 0',
    minWidth: 0,
    boxSizing: 'border-box' as const,
  },
  aiSidebar: {
    maxHeight: 'calc(100vh - 110px)',
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    boxSizing: 'border-box' as const,
    transition: 'all 0.3s ease',
    position: 'relative' as const,
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 70px)',
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #043873',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '20px',
  },
  loadingText: { fontSize: '18px', color: '#666', margin: 0 },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 70px)',
    padding: '40px 20px',
    textAlign: 'center' as const,
  },
  errorTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#dc3545',
    margin: '0 0 15px 0',
  },
  errorMessage: {
    fontSize: '16px',
    color: '#666',
    margin: '0 0 30px 0',
    maxWidth: '500px',
  },
  backButton: {
    backgroundColor: '#043873',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '16px',
    cursor: 'pointer',
  },
  header: {
    textAlign: 'center' as const,
    padding: '40px 20px 20px',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 10px 0',
  },
  subtitle: { fontSize: '16px', color: '#555', margin: '0 0 4px 0' },
  subtitleSmall: { fontSize: '13px', color: '#888', margin: 0 },
  content: { maxWidth: '900px', margin: '0 auto', padding: '0 20px 40px' },

  // Main result card
  mainResultCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '40px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    textAlign: 'center' as const,
    marginBottom: '30px',
  },
  estimandLabel: {
    fontSize: '18px',
    fontWeight: '600' as const,
    color: '#666',
    margin: '0 0 15px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
  },
  estimandBadge: {
    backgroundColor: '#e8f4ff',
    color: '#043873',
    padding: '2px 10px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '600' as const,
  },
  effectValue: {
    fontSize: '52px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 15px 0',
    fontFamily: 'monospace',
  },
  significanceBadge: {
    display: 'inline-block',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600' as const,
    marginBottom: '12px',
  },
  significantBadge: { backgroundColor: '#d4edda', color: '#155724' },
  notSignificantBadge: { backgroundColor: '#f8d7da', color: '#721c24' },
  weakInstrumentWarning: {
    backgroundColor: '#fff3cd',
    color: '#856404',
    border: '1px solid #ffc107',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '14px',
    margin: '10px 0 20px',
    lineHeight: '1.5',
  },
  statsRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '24px',
    marginTop: '24px',
    paddingTop: '20px',
    borderTop: '1px solid #eee',
    justifyContent: 'center',
  },
  statRowItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    minWidth: '200px',
  },
  statRowLabel: { fontSize: '14px', color: '#666', marginBottom: '4px' },
  statRowValue: {
    fontSize: '20px',
    fontWeight: 'bold' as const,
    color: '#043873',
    marginBottom: '8px',
  },
  expandButton: {
    padding: '4px 10px',
    backgroundColor: 'transparent',
    color: '#043873',
    border: '1px solid #043873',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  expandButtonActive: {
    padding: '4px 10px',
    backgroundColor: '#043873',
    color: '#fff',
    border: '1px solid #043873',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  explanationBox: {
    marginTop: '16px',
    padding: '16px 20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '10px',
    border: '1px solid #e9ecef',
    textAlign: 'left' as const,
  },
  explanationText: {
    margin: 0,
    fontSize: '14px',
    color: '#333',
    lineHeight: 1.6,
  },
  metaRow: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    marginTop: '20px',
    flexWrap: 'wrap' as const,
  },

  // Info cards
  infoCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '28px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    marginBottom: '24px',
  },
  infoCardMuted: {
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    border: '1px solid #dee2e6',
  },
  infoTitle: {
    fontSize: '20px',
    fontWeight: 'bold' as const,
    color: '#333',
    margin: '0 0 16px 0',
  },
  infoSubtitle: { fontSize: '14px', color: '#666', margin: '0 0 16px 0' },
  mutedNote: { fontSize: '14px', color: '#6c757d', margin: 0, lineHeight: '1.5' },

  // Instrument strength
  strengthHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '12px',
    flexWrap: 'wrap' as const,
  },
  fStatValue: {
    fontSize: '28px',
    fontWeight: 'bold' as const,
    color: '#043873',
    fontFamily: 'monospace',
  },
  fStatNote: { fontSize: '14px', color: '#666' },
  strengthMessage: {
    fontSize: '14px',
    color: '#444',
    lineHeight: '1.6',
    margin: '0 0 16px 0',
    padding: '12px 16px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
  },
  thresholdGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '10px',
  },
  thresholdItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    fontSize: '13px',
  },
  thresholdLabel: { color: '#666' },
  thresholdValue: { fontWeight: '600' as const, color: '#333' },
  subSectionTitle: {
    fontSize: '15px',
    fontWeight: '600' as const,
    color: '#043873',
    margin: '0 0 10px 0',
  },
  subSectionNote: {
    fontSize: '12px',
    color: '#888',
    fontWeight: 'normal' as const,
  },
  coefTable: {
    border: '1px solid #e9ecef',
    borderRadius: '8px',
    overflow: 'hidden' as const,
  },
  coefHeader: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
    backgroundColor: '#f8f9fa',
    padding: '10px 16px',
    fontSize: '12px',
    fontWeight: '600' as const,
    color: '#666',
    gap: '8px',
    borderBottom: '1px solid #e9ecef',
  },
  coefRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
    padding: '10px 16px',
    fontSize: '13px',
    color: '#333',
    gap: '8px',
    borderBottom: '1px solid #f0f0f0',
  },
  coefName: { fontWeight: '500' as const, color: '#043873' },

  // Endogeneity / overid tests
  testRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '12px',
    alignItems: 'center',
    marginBottom: '12px',
  },
  testStatLabel: { fontSize: '14px', color: '#666' },
  testStatValue: { fontSize: '16px', fontWeight: '600' as const, color: '#333' },
  testVerdict: {
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600' as const,
    width: '100%',
    textAlign: 'center' as const,
  },
  testExplanation: {
    fontSize: '13px',
    color: '#555',
    lineHeight: '1.6',
    margin: 0,
  },

  // OLS comparison
  comparisonGrid: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '16px',
    flexWrap: 'wrap' as const,
  },
  comparisonItem: {
    flex: 1,
    minWidth: '200px',
    padding: '18px',
    border: '1px solid #e0e0e0',
    borderRadius: '10px',
    textAlign: 'center' as const,
  },
  comparisonArrow: {
    fontSize: '24px',
    color: '#666',
    flexShrink: 0,
  },
  comparisonLabel: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '6px',
    fontWeight: '500' as const,
  },
  comparisonValue: {
    fontSize: '28px',
    fontWeight: 'bold' as const,
    color: '#333',
    fontFamily: 'monospace',
    marginBottom: '8px',
  },
  comparisonSub: { fontSize: '12px', color: '#888' },
  biasCorrectionNote: {
    fontSize: '13px',
    color: '#555',
    lineHeight: '1.6',
    margin: 0,
    padding: '10px 14px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
  },

  // Sensitivity / leave-one-out
  louTable: {
    border: '1px solid #e9ecef',
    borderRadius: '8px',
    overflow: 'hidden' as const,
  },
  louHeader: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr',
    backgroundColor: '#f8f9fa',
    padding: '10px 16px',
    fontSize: '12px',
    fontWeight: '600' as const,
    color: '#666',
    gap: '8px',
    borderBottom: '1px solid #e9ecef',
  },
  louRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr',
    padding: '10px 16px',
    fontSize: '13px',
    color: '#333',
    gap: '8px',
    borderBottom: '1px solid #f0f0f0',
  },

  // Warnings
  warningCard: {
    backgroundColor: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
  },
  warningTitle: {
    fontSize: '18px',
    fontWeight: 'bold' as const,
    color: '#856404',
    margin: '0 0 12px 0',
  },
  warningList: {
    margin: 0,
    paddingLeft: '20px',
    color: '#856404',
    lineHeight: '1.6',
    fontSize: '14px',
  },

  // AI sidebar
  aiSection: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    border: '1px solid #e0e0e0',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  aiSectionHeader: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#043873',
    margin: 0,
  },
  getAiButton: {
    backgroundColor: '#6366f1',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  aiLoading: { textAlign: 'center' as const, padding: '40px' },
  aiSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #4F9CF9',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 16px',
  },
  aiError: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #f5c6cb',
  },
  aiErrorNote: { fontSize: '14px', marginTop: '8px', opacity: 0.9 },
  retryButton: {
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '12px',
  },
  aiPrompt: { textAlign: 'center' as const, padding: '40px' },
  aiPromptTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 8px 0',
  },
  aiPromptText: {
    fontSize: '14px',
    color: '#666',
    lineHeight: '1.6',
    margin: '0 auto',
  },
  aiCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    border: '1px solid #e9ecef',
    borderLeft: '4px solid #4F9CF9',
  },
  aiCardWarning: {
    backgroundColor: '#fff3cd',
    border: '1px solid #ffc107',
    borderLeft: '4px solid #ffc107',
  },
  aiCardSuccess: {
    backgroundColor: '#d4edda',
    border: '1px solid #28a745',
    borderLeft: '4px solid #28a745',
  },
  aiCardNextSteps: {
    backgroundColor: '#e8f5e9',
    border: '1px solid #4caf50',
    borderLeft: '4px solid #4caf50',
  },
  aiCardRecommendation: {
    backgroundColor: '#e3f2fd',
    borderLeft: '4px solid #2196f3',
  },
  aiCardTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#043873',
    margin: '0 0 12px 0',
  },
  aiText: { fontSize: '16px', lineHeight: '1.6', color: '#333', margin: 0 },
  aiList: { margin: '10px 0', paddingLeft: '20px' },
  aiListItem: {
    fontSize: '14px',
    lineHeight: '1.6',
    color: '#333',
    marginBottom: '6px',
  },
  stepNumber: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '24px',
    height: '24px',
    backgroundColor: '#4caf50',
    color: 'white',
    borderRadius: '50%',
    marginRight: '8px',
    fontSize: '12px',
    fontWeight: 600,
  },
  confidenceLevel: {
    marginTop: '15px',
    fontSize: '14px',
    color: '#666',
    fontStyle: 'italic',
  },


  // ── Plain English box ─────────────────────────────────────────────────────
  plainEnglishBox: {
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '8px',
    padding: '12px 16px',
    marginTop: '12px',
    marginBottom: '6px',
  },
  plainEnglishLabel: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '700' as const,
    color: '#1d4ed8',
    marginBottom: '6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  plainEnglishText: {
    margin: 0,
    fontSize: '14px',
    color: '#1e3a5f',
    lineHeight: '1.6',
  },
  // ── F-stat visual bar ─────────────────────────────────────────────────────
  fStatBarWrapper: {
    position: 'relative' as const,
    marginTop: '16px',
    marginBottom: '4px',
    paddingBottom: '24px',
  },
  fStatBarTrack: {
    display: 'flex',
    height: '20px',
    borderRadius: '10px',
    overflow: 'hidden' as const,
    border: '1px solid #dee2e6',
  },
  fStatBarZone1: {
    flex: '1 1 12.5%',
    backgroundColor: '#f8d7da',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: '600' as const,
    color: '#721c24',
  },
  fStatBarZone2: {
    flex: '1 1 12.5%',
    backgroundColor: '#ffe5d0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: '600' as const,
    color: '#7d3c0d',
  },
  fStatBarZone3: {
    flex: '1 1 15%',
    backgroundColor: '#fff3cd',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: '600' as const,
    color: '#856404',
  },
  fStatBarZone4: {
    flex: '1 1 60%',
    backgroundColor: '#d4edda',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: '600' as const,
    color: '#155724',
  },
  fStatBarMarker: {
    position: 'absolute' as const,
    top: 0,
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  fStatBarPin: {
    width: '3px',
    height: '20px',
    backgroundColor: '#333',
    borderRadius: '2px',
  },
  fStatBarPinLabel: {
    marginTop: '4px',
    fontSize: '11px',
    fontWeight: 'bold' as const,
    color: '#333',
    whiteSpace: 'nowrap' as const,
    backgroundColor: 'white',
    padding: '1px 5px',
    borderRadius: '4px',
    border: '1px solid #ccc',
  },
  // ── Improve expand box ────────────────────────────────────────────────────
  explanationSimple: {
    margin: '0 0 10px 0',
    fontSize: '14px',
    color: '#1e3a5f',
    lineHeight: '1.6',
    backgroundColor: '#eff6ff',
    padding: '10px 12px',
    borderRadius: '6px',
    borderLeft: '3px solid #2563eb',
  },
  // ── Code Section Styles ───────────────────────────────────────────────────
  codeSection: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '30px 40px',
    marginBottom: '30px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e9ecef',
  },
  codeSectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  codeToggleButton: {
    backgroundColor: '#f8f9fa',
    color: '#212529',
    border: '1px solid #dee2e6',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600' as const,
    cursor: 'pointer',
  },
  codeContent: { marginTop: '20px' },
  codeDescription: {
    fontSize: '15px',
    color: '#666',
    marginBottom: '20px',
    lineHeight: '1.6',
  },
  languageTabs: {
    display: 'flex',
    gap: '10px',
    marginBottom: '15px',
  },
  languageTab: {
    backgroundColor: '#f8f9fa',
    color: '#212529',
    border: '2px solid #e9ecef',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: '600' as const,
    cursor: 'pointer',
  },
  languageTabActive: {
    backgroundColor: '#043873',
    color: 'white',
    borderColor: '#043873',
  },
  codeBlock: {
    backgroundColor: '#1e1e1e',
    borderRadius: '12px',
    overflow: 'hidden' as const,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  },
  codeBlockHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    backgroundColor: '#2d2d2d',
    borderBottom: '1px solid #3d3d3d',
  },
  codeBlockTitle: {
    color: '#9cdcfe',
    fontSize: '13px',
    fontWeight: '600' as const,
  },
  copyButton: {
    backgroundColor: '#4F9CF9',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: '600' as const,
    cursor: 'pointer',
  },
  codeText: {
    margin: 0,
    padding: '20px',
    fontSize: '13px',
    lineHeight: '1.6',
    color: '#d4d4d4',
    overflow: 'auto' as const,
    maxHeight: '500px',
    fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
  },
};
