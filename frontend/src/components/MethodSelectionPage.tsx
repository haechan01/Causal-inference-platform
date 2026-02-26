import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import BottomProgressBar from './BottomProgressBar';
import { useProgressStep } from '../hooks/useProgressStep';
import { aiService, MethodRecommendation } from '../services/aiService';
import { useAuth } from '../contexts/AuthContext';
import { projectStateService } from '../services/projectStateService';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    recommendation?: MethodRecommendation;
}

const getMethodEmoji = (code: string) => {
    switch (code) {
        case 'did': return '📊';
        case 'rdd': return '✂️';
        case 'iv': return '🎻';
        default: return '🔬';
    }
};

const MethodSelectionPage: React.FC = () => {
    const { currentStep, steps, goToPreviousStep } = useProgressStep();
    const { accessToken } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [selectedMethod, setSelectedMethod] = useState<string>('');
    const chatEndRef = useRef<HTMLDivElement>(null);

    const [projectId, setProjectId] = useState<number | null>((location.state as any)?.projectId || null);
    const [datasetId, setDatasetId] = useState<number | null>((location.state as any)?.datasetId || null);

    useEffect(() => {
        const loadSavedState = async () => {
            let currentProjectId = projectId;
            if (!currentProjectId) {
                const urlParams = new URLSearchParams(location.search);
                currentProjectId = parseInt(urlParams.get('projectId') || '0') || null;
                if (currentProjectId) setProjectId(currentProjectId);
            }
            if (currentProjectId && accessToken) {
                try {
                    const project = await projectStateService.loadProject(currentProjectId, accessToken);
                    if (project.selectedMethod) setSelectedMethod(project.selectedMethod);
                    if (!datasetId && project.datasets && project.datasets.length > 0) {
                        setDatasetId(project.datasets[0].id);
                    }
                } catch (error) {
                    console.error('Failed to load project state:', error);
                }
            }
        };
        loadSavedState();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, accessToken, location.search]);

    // ── Chat state ──────────────────────────────────────────────────────────
    const [inputMode, setInputMode] = useState<'chat' | 'recommend'>('chat');
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);

    // Recommend-mode form fields
    const [treatmentVariable, setTreatmentVariable] = useState('');
    const [outcomeVariable, setOutcomeVariable] = useState('');
    const [causalQuestion, setCausalQuestion] = useState('');
    type YesNo = 'yes' | 'no' | 'unsure';
    const [q1, setQ1] = useState<YesNo | null>(null);
    const [q2, setQ2] = useState<YesNo | null>(null);
    const [q3, setQ3] = useState<YesNo | null>(null);
    const [recLoading, setRecLoading] = useState(false);
    const [recError, setRecError] = useState<string | null>(null);

    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
        {
            role: 'assistant',
            content: "Hi! I'm your AI assistant for causal inference. I can help you:\n\n• Answer questions about methods, assumptions, and best practices\n• 🎯 Recommend the right method for your study (use the Recommend tab)\n\nWhat would you like to know?"
        }
    ]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages, chatLoading, recLoading]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleMethodSelect = async (method: string) => {
        setSelectedMethod(method);
        if (projectId && accessToken) {
            try {
                await projectStateService.saveState(projectId, { currentStep: 'method', selectedMethod: method }, accessToken);
            } catch (error) {
                console.error('Failed to save state:', error);
            }
        }
    };

    const handleNext = async () => {
        if (selectedMethod === 'did') {
            if (projectId && accessToken) {
                try { await projectStateService.saveState(projectId, { currentStep: 'variables', selectedMethod }, accessToken); } catch { }
            }
            navigate('/variable-selection', { state: { projectId, datasetId } });
        } else if (selectedMethod === 'rdd') {
            if (projectId && accessToken) {
                try { await projectStateService.saveState(projectId, { currentStep: 'rd-setup', selectedMethod }, accessToken); } catch { }
            }
            navigate('/rd-setup', { state: { projectId, datasetId } });
        } else if (selectedMethod === 'iv') {
            if (projectId && accessToken) {
                try { await projectStateService.saveState(projectId, { currentStep: 'iv-setup', selectedMethod }, accessToken); } catch { }
            }
            navigate('/iv-setup', { state: { projectId, datasetId } });
        } else {
            alert("This method is coming soon! Please select one of the available methods.");
        }
    };

    // Free-form chat
    const handleSendChat = async () => {
        const msg = chatInput.trim();
        if (!msg || chatLoading) return;
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
        setChatLoading(true);
        try {
            const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
            const result = await aiService.chat(
                msg,
                history,
                { parameters: { context: 'method_selection' } }
            );
            setChatMessages(prev => [...prev, { role: 'assistant', content: result.response }]);
        } catch (error: any) {
            setChatMessages(prev => [...prev, {
                role: 'assistant',
                content: '⚠️ Sorry, I encountered an error. Please try again.'
            }]);
        } finally {
            setChatLoading(false);
        }
    };

    const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendChat();
        }
    };

    // Structured recommendation
    const handleGetRecommendation = async () => {
        if (!treatmentVariable.trim() || !outcomeVariable.trim()) {
            setRecError('Please enter both a treatment variable and an outcome variable.');
            return;
        }
        setRecError(null);

        // Build a readable user message summarising their answers
        const answerLabel = (v: YesNo | null) =>
            v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Not sure';
        const parts = [
            `Treatment variable: "${treatmentVariable}"`,
            `Outcome variable: "${outcomeVariable}"`,
        ];
        if (causalQuestion.trim()) parts.push(`Research question: "${causalQuestion}"`);
        parts.push(
            `Q1 — Cutoff / rule-based treatment? ${answerLabel(q1)}`,
            `Q2 — Treatment changed over time for some groups? ${answerLabel(q2)}`,
            `Q3 — External factor affecting treatment but not outcome? ${answerLabel(q3)}`
        );

        setChatMessages(prev => [...prev, { role: 'user', content: parts.join('\n') }]);
        setRecLoading(true);
        try {
            const result = await aiService.recommendMethod(
                treatmentVariable.trim(),
                outcomeVariable.trim(),
                causalQuestion.trim() || undefined,
                q1 ?? undefined,
                q2 ?? undefined,
                q3 ?? undefined
            );
            setChatMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Based on your answers, here is my recommendation:',
                recommendation: result
            }]);
            if (result.method_code) setSelectedMethod(result.method_code);
            setInputMode('chat');
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message || 'Failed to get recommendation.';
            setRecError(msg);
            setChatMessages(prev => [...prev, { role: 'assistant', content: '⚠️ ' + msg }]);
        } finally {
            setRecLoading(false);
        }
    };

    const methodHasDescription = selectedMethod === 'did' || selectedMethod === 'rdd' || selectedMethod === 'iv';

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div>
            <Navbar />
            <div style={styles.contentContainer}>
                <div style={styles.pageRow}>

                    {/* ── Left column ── */}
                    <div style={styles.leftColumn}>
                        <div style={styles.header}>
                            <h2 style={styles.pageTitle}>Select Analysis Method</h2>
                            <p style={styles.subtitle}>Choose the causal inference method that fits your data and research question.</p>
                        </div>

                        {/* Method cards */}
                        <div style={styles.cardsContainer}>
                            <div
                                style={{ ...styles.methodCard, ...(selectedMethod === 'did' ? styles.selectedCard : {}) }}
                                onClick={() => handleMethodSelect('did')}
                            >
                                <div style={styles.statusBadge}>Available</div>
                                <div style={styles.cardContent}>
                                    <div style={styles.icon}>📈</div>
                                    <h3 style={styles.cardTitle}>Difference-in-Differences</h3>
                                    <p style={styles.cardDescription}>Compare changes over time between treatment and control groups</p>
                                </div>
                                <div style={styles.cardRadio}>
                                    <div style={{ ...styles.radioOuter, ...(selectedMethod === 'did' ? styles.radioOuterSelected : {}) }}>
                                        {selectedMethod === 'did' && <div style={styles.radioInner} />}
                                    </div>
                                </div>
                            </div>

                            <div
                                style={{ ...styles.methodCard, ...(selectedMethod === 'rdd' ? styles.selectedCard : {}) }}
                                onClick={() => handleMethodSelect('rdd')}
                            >
                                <div style={styles.statusBadge}>Available</div>
                                <div style={styles.cardContent}>
                                    <div style={styles.icon}>✂️</div>
                                    <h3 style={styles.cardTitle}>Regression Discontinuity</h3>
                                    <p style={styles.cardDescription}>Exploit cutoffs or thresholds to estimate causal effects</p>
                                </div>
                                <div style={styles.cardRadio}>
                                    <div style={{ ...styles.radioOuter, ...(selectedMethod === 'rdd' ? styles.radioOuterSelected : {}) }}>
                                        {selectedMethod === 'rdd' && <div style={styles.radioInner} />}
                                    </div>
                                </div>
                            </div>

                            <div
                                style={{ ...styles.methodCard, ...(selectedMethod === 'iv' ? styles.selectedCard : {}) }}
                                onClick={() => handleMethodSelect('iv')}
                            >
                                <div style={styles.statusBadge}>Available</div>
                                <div style={styles.cardContent}>
                                    <div style={styles.icon}>🎻</div>
                                    <h3 style={styles.cardTitle}>Instrumental Variables</h3>
                                    <p style={styles.cardDescription}>Use external instruments to isolate causal variation</p>
                                </div>
                                <div style={styles.cardRadio}>
                                    <div style={{ ...styles.radioOuter, ...(selectedMethod === 'iv' ? styles.radioOuterSelected : {}) }}>
                                        {selectedMethod === 'iv' && <div style={styles.radioInner} />}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Method description */}
                        {methodHasDescription && (
                            <div style={{ animation: 'fadeInUp 0.35s ease-out' }}>
                                {selectedMethod === 'did' && <DiDDescription styles={styles} />}
                                {selectedMethod === 'rdd' && <RDDDescription styles={styles} />}
                                {selectedMethod === 'iv' && <IVDescription styles={styles} />}
                            </div>
                        )}
                    </div>

                    {/* ── Right column: AI Chat Panel ── */}
                    <div style={styles.aiPanel}>
                        {/* Header */}
                        <div style={styles.aiPanelHeader}>
                            <div style={styles.aiPanelHeaderLeft}>
                                <div style={styles.aiAvatarCircle}>🤖</div>
                                <div>
                                    <div style={styles.aiPanelTitle}>AI Assistant</div>
                                    <div style={styles.aiPanelSubtitle}>Causal Inference Expert</div>
                                </div>
                            </div>
                            <div style={styles.aiOnlineDot} title="Online" />
                        </div>

                        {/* Chat messages */}
                        <div className="ai-chat-messages" style={styles.chatMessages}>
                            {chatMessages.map((msg, idx) => (
                                <div key={idx} style={msg.role === 'user' ? styles.userRow : styles.aiRow}>
                                    {msg.role === 'assistant' && <div style={styles.msgAvatar}>🤖</div>}
                                    <div style={msg.role === 'user' ? styles.userBubble : styles.aiBubble}>
                                        {msg.content.split('\n').map((line, i, arr) => (
                                            <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                                        ))}
                                        {msg.recommendation && (
                                            <RecommendationCard
                                                rec={msg.recommendation}
                                                onSelect={handleMethodSelect}
                                                styles={styles}
                                            />
                                        )}
                                    </div>
                                </div>
                            ))}

                            {(chatLoading || recLoading) && (
                                <div style={styles.aiRow}>
                                    <div style={styles.msgAvatar}>🤖</div>
                                    <div style={styles.aiBubble}>
                                        <div className="typing-indicator">
                                            <span className="typing-dot" />
                                            <span className="typing-dot" />
                                            <span className="typing-dot" />
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input area */}
                        <div style={styles.inputArea}>
                            {/* Mode tabs */}
                            <div style={styles.modeTabs}>
                                <button
                                    style={{ ...styles.modeTab, ...(inputMode === 'chat' ? styles.modeTabActive : {}) }}
                                    onClick={() => setInputMode('chat')}
                                >
                                    💬 Chat
                                </button>
                                <button
                                    style={{ ...styles.modeTab, ...(inputMode === 'recommend' ? styles.modeTabActive : {}) }}
                                    onClick={() => { setInputMode('recommend'); setRecError(null); }}
                                >
                                    🎯 Recommend
                                </button>
                            </div>

                            {/* Chat mode */}
                            {inputMode === 'chat' && (
                                <div style={styles.chatInputRow}>
                                    <textarea
                                        style={styles.chatTextarea}
                                        placeholder="Ask anything about causal inference… (Shift+Enter for new line)"
                                        value={chatInput}
                                        onChange={e => setChatInput(e.target.value)}
                                        onKeyDown={handleChatKeyDown}
                                        rows={3}
                                    />
                                    <button
                                        style={{
                                            ...styles.sendBtn,
                                            ...(!chatInput.trim() || chatLoading ? styles.sendBtnDisabled : {})
                                        }}
                                        onClick={handleSendChat}
                                        disabled={!chatInput.trim() || chatLoading}
                                        title="Send (Enter)"
                                    >
                                        <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
                                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                                        </svg>
                                    </button>
                                </div>
                            )}

                            {/* Recommend mode */}
                            {inputMode === 'recommend' && (
                                <div style={styles.recForm}>
                                    {recError && <div style={styles.recError}>⚠️ {recError}</div>}

                                    {/* Variables */}
                                    <div style={styles.recInputGrid}>
                                        <div style={styles.recField}>
                                            <label style={styles.recLabel}>Treatment variable <span style={styles.req}>*</span></label>
                                            <input style={styles.recInput} placeholder="e.g., scholarship, policy" value={treatmentVariable} onChange={e => setTreatmentVariable(e.target.value)} />
                                        </div>
                                        <div style={styles.recField}>
                                            <label style={styles.recLabel}>Outcome variable <span style={styles.req}>*</span></label>
                                            <input style={styles.recInput} placeholder="e.g., graduation rate, sales" value={outcomeVariable} onChange={e => setOutcomeVariable(e.target.value)} />
                                        </div>
                                    </div>
                                    <textarea
                                        style={{ ...styles.recInput, width: '100%', boxSizing: 'border-box' as const, resize: 'none' as const }}
                                        placeholder="Research question (optional)"
                                        value={causalQuestion}
                                        onChange={e => setCausalQuestion(e.target.value)}
                                        rows={2}
                                    />

                                    {/* Three guided questions */}
                                    <QuestionRow
                                        number={1}
                                        question="Is treatment determined by crossing a clear cutoff or rule?"
                                        example="e.g. income above a threshold, age above 65, test score above a cutoff"
                                        value={q1}
                                        onChange={setQ1}
                                        styles={styles}
                                    />
                                    <QuestionRow
                                        number={2}
                                        question="Did treatment start or change at a specific time for some groups but not others?"
                                        example="e.g. a new law, a policy in some regions, a program rolled out in certain schools"
                                        value={q2}
                                        onChange={setQ2}
                                        styles={styles}
                                    />
                                    <QuestionRow
                                        number={3}
                                        question="Is there something that strongly affects who gets treatment, but does NOT directly affect the outcome?"
                                        example="e.g. lottery assignment, distance to a facility, encouragement letters"
                                        value={q3}
                                        onChange={setQ3}
                                        styles={styles}
                                    />

                                    <button
                                        style={{
                                            ...styles.recSubmitBtn,
                                            ...(recLoading || !treatmentVariable.trim() || !outcomeVariable.trim() ? styles.sendBtnDisabled : {})
                                        }}
                                        onClick={handleGetRecommendation}
                                        disabled={recLoading || !treatmentVariable.trim() || !outcomeVariable.trim()}
                                    >
                                        {recLoading ? 'Analyzing…' : '🎯 Get Recommendation'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <BottomProgressBar
                currentStep={currentStep}
                steps={steps}
                onPrev={goToPreviousStep}
                onNext={handleNext}
                canGoNext={selectedMethod === 'did' || selectedMethod === 'rdd' || selectedMethod === 'iv'}
                onStepClick={(path) => navigate(path, { state: { projectId, datasetId } })}
            />
        </div>
    );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const RecommendationCard: React.FC<{
    rec: MethodRecommendation;
    onSelect: (code: string) => void;
    styles: Record<string, React.CSSProperties>;
}> = ({ rec, onSelect, styles }) => (
    <div style={styles.recCard}>
        <div style={styles.recMethodBadge}>
            {getMethodEmoji(rec.method_code)} {rec.recommended_method}
        </div>
        <p style={styles.recCardExplanation}>{rec.explanation}</p>
        {rec.key_assumption && (
            <div style={styles.recAssumptionBox}>
                <p style={styles.recCardLabel}>Key Assumption</p>
                <p style={styles.recAssumptionText}>{rec.key_assumption}</p>
            </div>
        )}
        {rec.why_not_others && (
            <div style={styles.recCardSection}>
                <p style={styles.recCardLabel}>Why Not the Others?</p>
                <p style={{ ...styles.recCardExplanation, color: '#64748b', margin: 0 }}>{rec.why_not_others}</p>
            </div>
        )}
        {rec.alternatives.length > 0 && (
            <div style={styles.recCardSection}>
                <p style={styles.recCardLabel}>When to Consider Alternatives</p>
                {rec.alternatives.map((alt, i) => (
                    <div key={i} style={styles.recAltItem}>
                        <strong>{getMethodEmoji(alt.code)} {alt.method}:</strong> {alt.when_appropriate}
                    </div>
                ))}
            </div>
        )}
        <button style={styles.recSelectBtn} onClick={() => onSelect(rec.method_code)}>
            Use {rec.recommended_method} →
        </button>
    </div>
);

type YesNoValue = 'yes' | 'no' | 'unsure' | null;

const QuestionRow: React.FC<{
    number: number;
    question: string;
    example: string;
    value: YesNoValue;
    onChange: (v: YesNoValue) => void;
    styles: Record<string, React.CSSProperties>;
}> = ({ number, question, example, value, onChange, styles }) => {
    const opts: { label: string; val: 'yes' | 'no' | 'unsure'; color: string; bg: string; border: string }[] = [
        { label: 'Yes', val: 'yes', color: '#15803d', bg: '#dcfce7', border: '#86efac' },
        { label: 'No', val: 'no', color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' },
        { label: 'Not sure', val: 'unsure', color: '#92400e', bg: '#fef3c7', border: '#fcd34d' }
    ];
    return (
        <div style={styles.questionRow}>
            <div style={styles.questionHeader}>
                <div style={styles.questionBadge}>{number}</div>
                <div>
                    <p style={styles.questionText}>{question}</p>
                    <p style={styles.questionExample}>{example}</p>
                </div>
            </div>
            <div style={styles.questionBtns}>
                {opts.map(o => (
                    <button
                        key={o.val}
                        style={{
                            ...styles.questionBtn,
                            ...(value === o.val ? {
                                backgroundColor: o.bg,
                                borderColor: o.border,
                                color: o.color,
                                fontWeight: '700'
                            } : {})
                        }}
                        onClick={() => onChange(value === o.val ? null : o.val)}
                    >
                        {value === o.val && o.val === 'yes'}
                        {value === o.val && o.val === 'no'}
                        {value === o.val && o.val === 'unsure'}
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

const DiDDescription: React.FC<{ styles: Record<string, React.CSSProperties> }> = ({ styles }) => (
    <div style={styles.methodExplanation}>
        <div style={styles.explanationHeader}>
            <h3 style={styles.explanationTitle}>📊 Difference-in-Differences (DiD)</h3>
            <p style={styles.explanationSubtitle}>A powerful method for estimating causal effects from observational data</p>
        </div>
        <div style={styles.whenToUseSection}>
            <h4 style={styles.whenToUseTitle}>✓ When to use this method</h4>
            <div style={styles.whenToUseGrid}>
                <div style={styles.whenToUseItem}><span>You have data from before and after a policy or event was introduced</span></div>
                <div style={styles.whenToUseItem}><span>Some people or places were affected by it while others weren't</span></div>
                <div style={styles.whenToUseItem}><span>The treated and untreated groups were following similar trends before the event</span></div>
            </div>
        </div>
        <div style={styles.explanationContent}>
            <div style={styles.chartSection}>
                <h4 style={styles.sectionTitle}>The Key Idea</h4>
                <div style={styles.chartContainer}>
                    <svg viewBox="0 0 500 280" style={styles.didChart}>
                        <defs>
                            <pattern id="grid" width="50" height="30" patternUnits="userSpaceOnUse">
                                <path d="M 50 0 L 0 0 0 30" fill="none" stroke="#e8e8e8" strokeWidth="0.5" />
                            </pattern>
                        </defs>
                        <rect x="60" y="20" width="400" height="200" fill="url(#grid)" />
                        <line x1="60" y1="220" x2="460" y2="220" stroke="#333" strokeWidth="2" />
                        <line x1="60" y1="20" x2="60" y2="220" stroke="#333" strokeWidth="2" />
                        <text x="25" y="120" style={{ fontSize: '12px', fill: '#666' }} transform="rotate(-90, 25, 120)">Outcome</text>
                        <text x="160" y="250" style={{ fontSize: '12px', fill: '#666', fontWeight: 'bold' }}>Before</text>
                        <text x="360" y="250" style={{ fontSize: '12px', fill: '#666', fontWeight: 'bold' }}>After</text>
                        <line x1="100" y1="150" x2="260" y2="130" stroke="#e74c3c" strokeWidth="3" />
                        <line x1="260" y1="130" x2="420" y2="60" stroke="#e74c3c" strokeWidth="3" />
                        <circle cx="420" cy="60" r="8" fill="#e74c3c" stroke="white" strokeWidth="2" />
                        <line x1="100" y1="180" x2="260" y2="160" stroke="#3498db" strokeWidth="3" />
                        <line x1="260" y1="160" x2="420" y2="140" stroke="#3498db" strokeWidth="3" />
                        <line x1="260" y1="130" x2="420" y2="110" stroke="#e74c3c" strokeWidth="2" strokeDasharray="8,4" opacity="0.5" />
                        <line x1="430" y1="110" x2="430" y2="60" stroke="#27ae60" strokeWidth="3" />
                        <polygon points="430,58 425,68 435,68" fill="#27ae60" />
                        <text x="445" y="90" style={{ fontSize: '11px', fill: '#27ae60', fontWeight: 'bold' }}>Causal</text>
                        <text x="445" y="102" style={{ fontSize: '11px', fill: '#27ae60', fontWeight: 'bold' }}>Effect</text>
                        <line x1="260" y1="20" x2="260" y2="220" stroke="#f39c12" strokeWidth="2" strokeDasharray="5,5" />
                        <rect x="70" y="30" width="150" height="60" fill="white" stroke="#ddd" rx="4" />
                        <line x1="80" y1="50" x2="110" y2="50" stroke="#e74c3c" strokeWidth="3" />
                        <text x="118" y="54" style={{ fontSize: '11px', fill: '#333' }}>Treatment Group</text>
                        <line x1="80" y1="70" x2="110" y2="70" stroke="#3498db" strokeWidth="3" />
                        <text x="118" y="74" style={{ fontSize: '11px', fill: '#333' }}>Control Group</text>
                    </svg>
                </div>
                <p style={styles.chartCaption}>DiD compares the change over time in the treatment group to the change in the control group. The <strong style={{ color: '#27ae60' }}>causal effect</strong> is the difference between what happened vs. what <em>would have happened</em> without treatment.</p>
            </div>
            <div style={styles.conceptsSection}>
                <h4 style={styles.sectionTitle}>Key Concepts</h4>
                <div style={styles.conceptsGrid}>
                    {[
                        { icon: '🔀', title: 'Parallel Trends', text: 'Without treatment, both groups would have followed similar trends over time.' },
                        { icon: '⏰', title: 'Before & After', text: 'You need observations from both before and after the treatment.' },
                        { icon: '👥', title: 'Treatment & Control', text: 'One group receives treatment while the other provides a comparison baseline.' },
                        { icon: '📐', title: 'The "Double Difference"', text: 'Effect = (Treated After−Before) − (Control After−Before).' }
                    ].map((c, i) => (
                        <div key={i} style={styles.conceptCard}>
                            <h5 style={styles.conceptTitle}>{c.title}</h5>
                            <p style={styles.conceptText}>{c.text}</p>
                        </div>
                    ))}
                </div>
            </div>
            <div style={styles.exampleSection}>
                <h4 style={styles.sectionTitle}>Example: Minimum Wage Study</h4>
                <div style={styles.exampleBox}>
                    <div style={styles.exampleScenario}><p><strong>Question:</strong> Did raising the minimum wage in New Jersey affect fast-food employment?</p></div>
                    <div style={styles.exampleSteps}>
                        {[
                            { label: 'Treatment Group', text: 'Fast-food restaurants in New Jersey (minimum wage raised)' },
                            { label: 'Control Group', text: 'Fast-food restaurants in Pennsylvania (no change)' },
                            { label: 'Outcome', text: 'Employment levels before and after the policy' },
                            { label: 'Result', text: 'DiD revealed no significant negative impact on employment' }
                        ].map((s, i) => (
                            <div key={i} style={styles.exampleStep}>
                                <div style={styles.stepNumber}>{i + 1}</div>
                                <div><strong>{s.label}:</strong> {s.text}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div style={styles.formulaSection}>
                <h4 style={styles.sectionTitle}>The Math (Simplified)</h4>
                <div style={styles.formulaBox}>
                    <div style={styles.formula}>
                        <span style={styles.formulaHighlight}>DiD Effect</span> =
                        <span style={styles.formulaChange}> (Y<sub>T,after</sub> − Y<sub>T,before</sub>)</span> −
                        <span style={styles.formulaBaseline}> (Y<sub>C,after</sub> − Y<sub>C,before</sub>)</span>
                    </div>
                    <div style={styles.formulaLegend}>
                        <span><span style={styles.formulaChange}>■</span> Change in treatment group</span>
                        <span><span style={styles.formulaBaseline}>■</span> Change in control group</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
);

const RDDDescription: React.FC<{ styles: Record<string, React.CSSProperties> }> = ({ styles }) => (
    <div style={styles.methodExplanation}>
        <div style={styles.explanationHeader}>
            <h3 style={styles.explanationTitle}>✂️ Regression Discontinuity (RDD)</h3>
            <p style={styles.explanationSubtitle}>Exploiting cutoffs to estimate causal effects</p>
        </div>
        <div style={styles.whenToUseSection}>
            <h4 style={styles.whenToUseTitle}>✓ When to use this method</h4>
            <div style={styles.whenToUseGrid}>
                <div style={styles.whenToUseItem}><span>Treatment is given to everyone above (or below) a specific score or cutoff — e.g. GPA ≥ 3.5, age ≥ 65</span></div>
                <div style={styles.whenToUseItem}><span>People just above and just below the cutoff are nearly identical in all other ways</span></div>
                <div style={styles.whenToUseItem}><span>Nothing else jumps sharply at that exact threshold</span></div>
            </div>
        </div>
        <div style={styles.explanationContent}>
            <div style={styles.chartSection}>
                <h4 style={styles.sectionTitle}>The Key Idea</h4>
                <div style={styles.chartContainer}>
                    <svg viewBox="0 0 500 280" style={styles.didChart}>
                        <defs>
                            <pattern id="rdd-grid" width="50" height="30" patternUnits="userSpaceOnUse">
                                <path d="M 50 0 L 0 0 0 30" fill="none" stroke="#e8e8e8" strokeWidth="0.5" />
                            </pattern>
                        </defs>
                        <rect x="60" y="20" width="400" height="200" fill="url(#rdd-grid)" />
                        <line x1="60" y1="220" x2="460" y2="220" stroke="#333" strokeWidth="2" />
                        <line x1="60" y1="20" x2="60" y2="220" stroke="#333" strokeWidth="2" />
                        <text x="25" y="120" style={{ fontSize: '12px', fill: '#666' }} transform="rotate(-90, 25, 120)">Outcome</text>
                        <text x="220" y="250" style={{ fontSize: '12px', fill: '#666', fontWeight: 'bold' }}>Running Variable (Score)</text>
                        <line x1="260" y1="20" x2="260" y2="220" stroke="#f39c12" strokeWidth="3" strokeDasharray="5,5" />
                        <text x="265" y="35" style={{ fontSize: '11px', fill: '#f39c12', fontWeight: 'bold' }}>Cutoff</text>
                        <line x1="80" y1="180" x2="260" y2="140" stroke="#3498db" strokeWidth="3" />
                        {[100, 130, 160, 190, 220, 245].map((cx, i) => (
                            <circle key={i} cx={cx} cy={175 - i * 7} r="4" fill="#3498db" opacity="0.6" />
                        ))}
                        <line x1="260" y1="100" x2="440" y2="70" stroke="#e74c3c" strokeWidth="3" />
                        {[275, 300, 330, 360, 390, 420].map((cx, i) => (
                            <circle key={i} cx={cx} cy={98 - i * 5} r="4" fill="#e74c3c" opacity="0.6" />
                        ))}
                        <line x1="260" y1="140" x2="320" y2="125" stroke="#3498db" strokeWidth="2" strokeDasharray="8,4" opacity="0.5" />
                        <line x1="270" y1="122" x2="270" y2="97" stroke="#27ae60" strokeWidth="3" />
                        <polygon points="270,95 265,105 275,105" fill="#27ae60" />
                        <text x="280" y="110" style={{ fontSize: '11px', fill: '#27ae60', fontWeight: 'bold' }}>Causal</text>
                        <text x="280" y="122" style={{ fontSize: '11px', fill: '#27ae60', fontWeight: 'bold' }}>Effect</text>
                        <rect x="70" y="30" width="150" height="60" fill="white" stroke="#ddd" rx="4" />
                        <line x1="80" y1="50" x2="110" y2="50" stroke="#3498db" strokeWidth="3" />
                        <text x="118" y="54" style={{ fontSize: '11px', fill: '#333' }}>Below Cutoff</text>
                        <line x1="80" y1="70" x2="110" y2="70" stroke="#e74c3c" strokeWidth="3" />
                        <text x="118" y="74" style={{ fontSize: '11px', fill: '#333' }}>Above Cutoff</text>
                    </svg>
                </div>
                <p style={styles.chartCaption}>RDD exploits a sharp cutoff in treatment assignment. Units just above and below the threshold are nearly identical, so the <strong style={{ color: '#27ae60' }}>jump at the cutoff</strong> reveals the causal effect.</p>
            </div>
            <div style={styles.conceptsSection}>
                <h4 style={styles.sectionTitle}>Key Concepts</h4>
                <div style={styles.conceptsGrid}>
                    {[
                        { icon: '✂️', title: 'Sharp Cutoff', text: 'Treatment assigned by a clear threshold in a running variable (e.g., score ≥ 70).' },
                        { icon: '🎯', title: 'Local Comparison', text: 'Units just above and below are nearly identical — a natural experiment.' },
                        { icon: '📊', title: 'Continuity Assumption', text: 'Without treatment the outcome would change smoothly through the cutoff.' },
                        { icon: '🔍', title: 'The Discontinuity', text: 'Any jump at the cutoff is attributed to the causal effect of treatment.' }
                    ].map((c, i) => (
                        <div key={i} style={styles.conceptCard}>
                            <h5 style={styles.conceptTitle}>{c.title}</h5>
                            <p style={styles.conceptText}>{c.text}</p>
                        </div>
                    ))}
                </div>
            </div>
            <div style={styles.exampleSection}>
                <h4 style={styles.sectionTitle}>Example: Scholarship Eligibility</h4>
                <div style={styles.exampleBox}>
                    <div style={styles.exampleScenario}><p><strong>Question:</strong> Does a merit scholarship improve college graduation rates?</p></div>
                    <div style={styles.exampleSteps}>
                        {[
                            { label: 'Running Variable', text: 'High school GPA (determines eligibility)' },
                            { label: 'Cutoff', text: 'Students with GPA ≥ 3.5 receive the scholarship' },
                            { label: 'Key Insight', text: 'Students at 3.49 vs. 3.51 GPA are nearly identical but one gets the scholarship' },
                            { label: 'Result', text: 'Compare graduation rates just above vs. below 3.5 to isolate the effect' }
                        ].map((s, i) => (
                            <div key={i} style={styles.exampleStep}>
                                <div style={styles.stepNumber}>{i + 1}</div>
                                <div><strong>{s.label}:</strong> {s.text}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div style={styles.formulaSection}>
                <h4 style={styles.sectionTitle}>The Math (Simplified)</h4>
                <div style={styles.formulaBox}>
                    <div style={styles.formula}>
                        <span style={styles.formulaHighlight}>RDD Effect</span> =
                        <span style={styles.formulaChange}> lim<sub>x→c⁺</sub> E[Y|X=x]</span> −
                        <span style={styles.formulaBaseline}> lim<sub>x→c⁻</sub> E[Y|X=x]</span>
                    </div>
                    <div style={styles.formulaLegend}>
                        <span><span style={styles.formulaChange}>■</span> Outcome just above cutoff</span>
                        <span><span style={styles.formulaBaseline}>■</span> Outcome just below cutoff</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
);

const IVDescription: React.FC<{ styles: Record<string, React.CSSProperties> }> = ({ styles }) => (
    <div style={styles.methodExplanation}>
        <div style={styles.explanationHeader}>
            <h3 style={styles.explanationTitle}>🎻 Instrumental Variables (IV)</h3>
            <p style={styles.explanationSubtitle}>Using external variation to identify causal effects</p>
        </div>
        <div style={styles.whenToUseSection}>
            <h4 style={styles.whenToUseTitle}>✓ When to use this method</h4>
            <div style={styles.whenToUseGrid}>
                <div style={styles.whenToUseItem}><span>Something hidden affects both who gets treated and the outcome, making a direct comparison misleading</span></div>
                <div style={styles.whenToUseItem}><span>You have an external factor that nudges people into treatment but has no direct effect on the outcome (e.g. a lottery, distance to a facility, etc)</span></div>
                <div style={styles.whenToUseItem}><span>You want to use that external encouragement to isolate the true effect of treatment, free from the hidden bias</span></div>
            </div>
        </div>
        <div style={styles.explanationContent}>
            <div style={styles.chartSection}>
                <h4 style={styles.sectionTitle}>The Key Idea: Causal Structure (DAG)</h4>
                <div style={styles.chartContainer}>
                    <svg viewBox="0 0 520 290" style={styles.didChart}>
                        <defs>
                            <marker id="iv-arr" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
                                <polygon points="0 0, 9 3.5, 0 7" fill="#334155" />
                            </marker>
                        </defs>

                        {/* Confounder (top center, red) */}
                        <rect x="178" y="16" width="164" height="64" rx="10" fill="#fef2f2" stroke="#ef4444" strokeWidth="2" />
                        <text x="260" y="43" textAnchor="middle" style={{ fontSize: '15px', fontWeight: '700', fill: '#dc2626' }}>Confounder</text>
                        <text x="260" y="62" textAnchor="middle" style={{ fontSize: '10.5px', fill: '#ef4444', fontStyle: 'italic' }}>e.g. Ability, Motivation</text>

                        {/* Instrument (left, blue) */}
                        <rect x="15" y="128" width="134" height="64" rx="10" fill="#eff6ff" stroke="#3b82f6" strokeWidth="2" />
                        <text x="82" y="155" textAnchor="middle" style={{ fontSize: '15px', fontWeight: '700', fill: '#1d4ed8' }}>Instrument</text>
                        <text x="82" y="175" textAnchor="middle" style={{ fontSize: '10.5px', fill: '#3b82f6', fontStyle: 'italic' }}>e.g. Birth Quarter</text>

                        {/* Treatment (center, amber) */}
                        <rect x="193" y="128" width="134" height="64" rx="10" fill="#fffbeb" stroke="#f59e0b" strokeWidth="2" />
                        <text x="260" y="155" textAnchor="middle" style={{ fontSize: '15px', fontWeight: '700', fill: '#92400e' }}>Treatment</text>
                        <text x="260" y="175" textAnchor="middle" style={{ fontSize: '10.5px', fill: '#b45309', fontStyle: 'italic' }}>e.g. Education</text>

                        {/* Outcome (right, green) */}
                        <rect x="371" y="128" width="134" height="64" rx="10" fill="#f0fdf4" stroke="#22c55e" strokeWidth="2" />
                        <text x="438" y="155" textAnchor="middle" style={{ fontSize: '15px', fontWeight: '700', fill: '#166534' }}>Outcome</text>
                        <text x="438" y="175" textAnchor="middle" style={{ fontSize: '10.5px', fill: '#16a34a', fontStyle: 'italic' }}>e.g. Wages</text>

                        {/* Confounder → Treatment (solid, from bottom-center of confounder) */}
                        <line x1="254" y1="80" x2="254" y2="123" stroke="#334155" strokeWidth="2" markerEnd="url(#iv-arr)" />

                        {/* Confounder → Outcome (solid, diagonal from right edge of confounder) */}
                        <line x1="340" y1="48" x2="428" y2="123" stroke="#334155" strokeWidth="2" markerEnd="url(#iv-arr)" />

                        {/* Instrument → Treatment */}
                        <line x1="149" y1="160" x2="188" y2="160" stroke="#334155" strokeWidth="2.5" markerEnd="url(#iv-arr)" />
                        <text x="168" y="120" textAnchor="middle" style={{ fontSize: '10px', fill: '#475569', fontWeight: '600' }}>First Stage</text>

                        {/* Treatment → Outcome */}
                        <line x1="327" y1="160" x2="366" y2="160" stroke="#334155" strokeWidth="2.5" markerEnd="url(#iv-arr)" />
                        <text x="346" y="120" textAnchor="middle" style={{ fontSize: '10px', fill: '#475569', fontWeight: '600' }}>Causal Effect</text>

                        {/* Blocked arc below — Instrument → Outcome */}
                        <path d="M 82,192 Q 260,278 438,192" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5,4" />
                        <text x="260" y="268" textAnchor="middle" style={{ fontSize: '10px', fill: '#64748b' }}>No direct path</text>
                    </svg>
                </div>
                <p style={styles.chartCaption}>
                    The <strong style={{ color: '#dc2626' }}>Confounder</strong> (e.g. ability) is the problem because it affects both who gets treated and the outcome, so a direct comparison is biased. The <strong style={{ color: '#1d4ed8' }}>Instrument</strong> is the solution: it shifts <strong style={{ color: '#92400e' }}>Treatment</strong> (First Stage), and because it has <em>no direct path to Outcome</em>, any effect it has on <strong style={{ color: '#166534' }}>Outcome</strong> must flow entirely through Treatment, giving us a clean, unbiased estimate of the Causal Effect.
                </p>
            </div>
            <div style={styles.conceptsSection}>
                <h4 style={styles.sectionTitle}>Key Concepts</h4>
                <div style={styles.conceptsGrid}>
                    {[
                        { title: 'Relevance', text: 'The instrument must be strongly correlated with the treatment variable (first-stage F > 10).' },
                        { title: 'Exclusion Restriction', text: 'The instrument affects the outcome only through treatment — no direct effect allowed.' },
                        { title: 'Independence', text: 'The instrument must be uncorrelated with unobserved confounders (ideally "as-good-as-random").' },
                        { title: 'LATE', text: '2SLS estimates the Local Average Treatment Effect for "compliers" — units who comply with treatment due to the instrument.' }
                    ].map((c, i) => (
                        <div key={i} style={styles.conceptCard}>
                            <h5 style={styles.conceptTitle}>{c.title}</h5>
                            <p style={styles.conceptText}>{c.text}</p>
                        </div>
                    ))}
                </div>
            </div>
            <div style={styles.exampleSection}>
                <h4 style={styles.sectionTitle}>Example: Returns to Education</h4>
                <div style={styles.exampleBox}>
                    <div style={styles.exampleScenario}><p><strong>Question:</strong> Does education increase wages, correcting for ability bias?</p></div>
                    <div style={styles.exampleSteps}>
                        {[
                            { label: 'Outcome', text: 'Wages (what we want to explain)' },
                            { label: 'Treatment', text: 'Years of education (endogenous — correlated with ability)' },
                            { label: 'Instrument', text: 'Quarter of birth (affects school entry age, but not wages directly)' },
                            { label: 'Result', text: 'Angrist & Krueger (1991) found a positive return to education after correcting for endogeneity' }
                        ].map((s, i) => (
                            <div key={i} style={styles.exampleStep}>
                                <div style={styles.stepNumber}>{i + 1}</div>
                                <div><strong>{s.label}:</strong> {s.text}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div style={styles.formulaSection}>
                <h4 style={styles.sectionTitle}>The Math (Simplified)</h4>
                <div style={styles.formulaBox}>
                    <div style={styles.formula}>
                        <span style={styles.formulaHighlight}>2SLS Effect</span> =
                        <span style={styles.formulaChange}> Cov(Y, Z)</span> /
                        <span style={styles.formulaBaseline}> Cov(D, Z)</span>
                    </div>
                    <div style={styles.formulaLegend}>
                        <span><span style={styles.formulaChange}>■</span> Reduced form (Z → Y)</span>
                        <span><span style={styles.formulaBaseline}>■</span> First stage (Z → D)</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
);

export default MethodSelectionPage;

// ── Styles ────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
    contentContainer: {
        paddingTop: '70px',
        paddingBottom: '80px',
        minHeight: 'calc(100vh - 70px)',
        backgroundColor: '#f5f5f5'
    },
    // Always a two-column row
    pageRow: {
        display: 'flex',
        flexDirection: 'row',
        gap: '24px',
        padding: '24px 24px',
        maxWidth: '1400px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        alignItems: 'flex-start'
    },
    // Left: header + cards + description
    leftColumn: {
        flex: '1 1 0',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '28px'
    },
    header: { textAlign: 'center' },
    pageTitle: { fontSize: '26px', fontWeight: 'bold', color: '#043873', margin: '0 0 8px 0' },
    subtitle: { fontSize: '15px', color: '#666', margin: 0 },

    cardsContainer: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
        width: '100%'
    },
    methodCard: {
        backgroundColor: 'white',
        borderRadius: '14px',
        padding: '20px 16px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
        cursor: 'pointer',
        border: '2px solid transparent',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        minHeight: '190px'
    },
    methodCardDisabled: { opacity: 0.65 },
    selectedCard: {
        borderColor: '#043873',
        backgroundColor: '#f0f7ff',
        transform: 'translateY(-2px)',
        boxShadow: '0 6px 18px rgba(4,56,115,0.14)'
    },
    cardContent: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px'
    },
    icon: { fontSize: '32px' },
    cardTitle: { fontSize: '14px', fontWeight: '600', color: '#043873', margin: 0, lineHeight: '1.3' },
    cardDescription: { fontSize: '12px', color: '#666', lineHeight: '1.4', margin: 0 },
    cardRadio: { marginTop: '14px' },
    radioOuter: {
        width: '20px', height: '20px', borderRadius: '50%',
        border: '2px solid #cbd5e1',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s'
    },
    radioOuterSelected: { borderColor: '#043873' },
    radioInner: { width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#043873' },
    statusBadge: {
        backgroundColor: '#d4edda', color: '#155724',
        padding: '3px 10px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', marginBottom: '10px'
    },
    comingSoonBadge: {
        backgroundColor: '#f1f5f9', color: '#64748b',
        padding: '3px 10px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', marginBottom: '10px'
    },

    // ── AI Panel ──────────────────────────────────────────────────────────────
    aiPanel: {
        flex: '0 0 400px',
        width: '400px',
        position: 'sticky',
        top: '90px',
        height: 'calc(100vh - 170px)',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'white',
        borderRadius: '18px',
        boxShadow: '0 6px 30px rgba(0,0,0,0.12)',
        border: '1px solid #e2e8f0',
        overflow: 'hidden'
    },
    aiPanelHeader: {
        padding: '14px 18px',
        background: 'linear-gradient(135deg, #043873 0%, #1a5ba8 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
    },
    aiPanelHeaderLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
    aiAvatarCircle: {
        fontSize: '20px', width: '36px', height: '36px',
        backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
    },
    aiPanelTitle: { color: 'white', fontWeight: '700', fontSize: '14px' },
    aiPanelSubtitle: { color: 'rgba(255,255,255,0.65)', fontSize: '11px', marginTop: '1px' },
    aiOnlineDot: {
        width: '9px', height: '9px', borderRadius: '50%',
        backgroundColor: '#4ade80', boxShadow: '0 0 0 2px rgba(74,222,128,0.3)'
    },

    chatMessages: {
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        backgroundColor: '#f8fafc'
    },
    userRow: { display: 'flex', justifyContent: 'flex-end' },
    aiRow: { display: 'flex', alignItems: 'flex-start', gap: '7px' },
    msgAvatar: { fontSize: '16px', flexShrink: 0, marginTop: '3px' },
    userBubble: {
        backgroundColor: '#043873', color: 'white',
        borderRadius: '16px 16px 4px 16px',
        padding: '10px 14px', maxWidth: '84%',
        fontSize: '13px', lineHeight: '1.55'
    },
    aiBubble: {
        backgroundColor: 'white', color: '#1e293b',
        borderRadius: '4px 16px 16px 16px',
        padding: '10px 14px', maxWidth: '92%',
        fontSize: '13px', lineHeight: '1.55',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        border: '1px solid #e8ecf0'
    },

    // ── Input area ────────────────────────────────────────────────────────────
    inputArea: {
        borderTop: '1px solid #e8ecf0',
        backgroundColor: 'white',
        flexShrink: 0
    },
    modeTabs: {
        display: 'flex',
        borderBottom: '1px solid #f0f0f0',
        padding: '0 12px'
    },
    modeTab: {
        flex: 1, padding: '10px 8px',
        background: 'none', border: 'none',
        cursor: 'pointer', fontSize: '12.5px',
        fontWeight: '500', color: '#94a3b8',
        borderBottom: '2px solid transparent',
        marginBottom: '-1px', transition: 'all 0.15s'
    },
    modeTabActive: {
        color: '#043873',
        borderBottomColor: '#043873',
        fontWeight: '700'
    },

    // Chat tab
    chatInputRow: {
        display: 'flex', gap: '8px',
        padding: '12px'
    },
    chatTextarea: {
        flex: 1,
        padding: '9px 12px',
        fontSize: '13px',
        border: '1.5px solid #e2e8f0',
        borderRadius: '10px',
        fontFamily: 'inherit',
        resize: 'none',
        outline: 'none',
        lineHeight: '1.45',
        boxSizing: 'border-box'
    },
    sendBtn: {
        width: '40px', height: '40px',
        borderRadius: '10px',
        backgroundColor: '#043873',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, alignSelf: 'flex-end'
    },
    sendBtnDisabled: {
        backgroundColor: '#94a3b8',
        cursor: 'not-allowed'
    },

    // Recommend tab
    recForm: {
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    },
    recError: {
        padding: '7px 10px',
        backgroundColor: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '6px',
        color: '#dc2626',
        fontSize: '12px'
    },
    recInputGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px'
    },
    recField: { display: 'flex', flexDirection: 'column', gap: '3px' },
    recLabel: { fontSize: '11px', fontWeight: '600', color: '#64748b' },
    req: { color: '#e74c3c' },
    recInput: {
        padding: '7px 9px',
        fontSize: '12.5px',
        border: '1.5px solid #e2e8f0',
        borderRadius: '7px',
        fontFamily: 'inherit',
        outline: 'none'
    },
    recChecks: { display: 'flex', flexDirection: 'column', gap: '5px' },
    recCheckLabel: {
        display: 'flex', alignItems: 'center', gap: '6px',
        fontSize: '12px', color: '#475569', cursor: 'pointer'
    },
    recCheckbox: { width: '14px', height: '14px', accentColor: '#043873', cursor: 'pointer' },
    recSubmitBtn: {
        padding: '9px', fontSize: '13px', fontWeight: '600',
        color: 'white', backgroundColor: '#043873',
        border: 'none', borderRadius: '8px', cursor: 'pointer'
    },

    // Question rows in Recommend tab
    questionRow: {
        backgroundColor: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '9px',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    },
    questionHeader: {
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-start'
    },
    questionBadge: {
        width: '20px', height: '20px', borderRadius: '50%',
        backgroundColor: '#043873', color: 'white',
        fontSize: '11px', fontWeight: '700',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: '1px'
    },
    questionText: {
        fontSize: '12px', fontWeight: '600', color: '#1e293b',
        margin: '0 0 2px 0', lineHeight: '1.4'
    },
    questionExample: {
        fontSize: '11px', color: '#64748b', margin: 0, lineHeight: '1.4'
    },
    questionBtns: {
        display: 'flex', gap: '6px'
    },
    questionBtn: {
        flex: 1, padding: '5px 4px',
        border: '1.5px solid #e2e8f0',
        borderRadius: '6px', backgroundColor: 'white',
        fontSize: '11.5px', fontWeight: '500',
        color: '#475569', cursor: 'pointer',
        transition: 'all 0.15s'
    },

    // Recommendation card inside AI bubble
    recCard: {
        marginTop: '10px', padding: '12px',
        backgroundColor: '#f0f7ff', borderRadius: '10px',
        border: '1.5px solid #bfdbfe'
    },
    recMethodBadge: {
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        backgroundColor: '#043873', color: 'white',
        padding: '4px 11px', borderRadius: '20px',
        fontSize: '12px', fontWeight: '700', marginBottom: '8px'
    },
    recCardExplanation: {
        fontSize: '12px', color: '#334155', lineHeight: '1.6', margin: '0 0 8px 0'
    },
    recAssumptionBox: {
        backgroundColor: '#fffbeb',
        border: '1px solid #fcd34d',
        borderRadius: '7px',
        padding: '8px 10px',
        marginBottom: '8px'
    },
    recAssumptionText: {
        fontSize: '11.5px', color: '#92400e', lineHeight: '1.55', margin: 0, fontStyle: 'italic'
    },
    recCardSection: { marginBottom: '8px' },
    recCardLabel: {
        fontSize: '10px', fontWeight: '700', color: '#64748b',
        textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px 0'
    },
    recCardList: {
        margin: '0 0 0 14px', padding: 0,
        fontSize: '11.5px', color: '#475569', lineHeight: '1.7'
    },
    recAltItem: {
        fontSize: '11.5px', color: '#475569',
        padding: '4px 7px', backgroundColor: 'white',
        borderRadius: '5px', marginTop: '3px',
        border: '1px solid #e2e8f0', lineHeight: '1.5'
    },
    recSelectBtn: {
        width: '100%', padding: '8px 12px',
        backgroundColor: '#043873', color: 'white',
        border: 'none', borderRadius: '7px',
        fontSize: '12.5px', fontWeight: '600', cursor: 'pointer',
        marginTop: '4px'
    },

    // Method description styles
    methodExplanation: {
        backgroundColor: 'white', borderRadius: '16px', padding: '30px',
        boxShadow: '0 6px 28px rgba(4,56,115,0.1)',
        border: '1px solid rgba(4,56,115,0.08)'
    },
    explanationHeader: {
        textAlign: 'center', marginBottom: '22px',
        paddingBottom: '18px', borderBottom: '2px solid #f0f4f8'
    },
    explanationTitle: { fontSize: '24px', fontWeight: 'bold', color: '#043873', margin: '0 0 8px 0' },
    explanationSubtitle: { fontSize: '14px', color: '#666', margin: 0 },
    whenToUseSection: {
        backgroundColor: '#f0f7ff', borderRadius: '10px',
        padding: '18px 22px', marginBottom: '26px', border: '1px solid #d4e5f7'
    },
    whenToUseTitle: { fontSize: '15px', fontWeight: '600', color: '#043873', margin: '0 0 14px 0' },
    whenToUseGrid: { display: 'flex', flexDirection: 'column', gap: '10px' },
    whenToUseItem: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#334155' },
    explanationContent: { display: 'flex', flexDirection: 'column', gap: '30px' },
    chartSection: { textAlign: 'center' },
    sectionTitle: {
        fontSize: '16px', fontWeight: '600', color: '#043873', marginBottom: '16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px'
    },
    chartContainer: {
        backgroundColor: '#fafbfc', borderRadius: '10px',
        padding: '20px', border: '1px solid #e8e8e8', marginBottom: '12px'
    },
    didChart: { width: '100%', maxWidth: '480px', height: 'auto' },
    chartCaption: {
        fontSize: '13px', color: '#555', lineHeight: '1.65',
        maxWidth: '580px', margin: '0 auto', textAlign: 'center'
    },
    conceptsSection: {},
    conceptsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' },
    conceptCard: {
        backgroundColor: '#f8fafc', borderRadius: '10px',
        padding: '18px', border: '1px solid #e2e8f0'
    },
    conceptTitle: { fontSize: '14px', fontWeight: '600', color: '#043873', margin: '0 0 6px 0' },
    conceptText: { fontSize: '12.5px', color: '#555', lineHeight: '1.6', margin: 0 },
    exampleSection: {},
    exampleBox: { backgroundColor: '#f8f9fa', borderRadius: '10px', padding: '22px', border: '1px solid #e2e8f0' },
    exampleScenario: {
        backgroundColor: '#e8f4fc', borderRadius: '7px',
        padding: '13px 18px', marginBottom: '16px', borderLeft: '4px solid #3498db'
    },
    exampleSteps: { display: 'flex', flexDirection: 'column', gap: '10px' },
    exampleStep: {
        display: 'flex', alignItems: 'flex-start', gap: '12px',
        backgroundColor: 'white', padding: '12px', borderRadius: '7px', border: '1px solid #eee'
    },
    stepNumber: {
        width: '26px', height: '26px', borderRadius: '50%',
        backgroundColor: '#043873', color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 'bold', fontSize: '13px', flexShrink: 0
    },
    formulaSection: {},
    formulaBox: { backgroundColor: '#1a1a2e', borderRadius: '10px', padding: '22px', textAlign: 'center' },
    formula: {
        fontSize: '16px', color: '#fff',
        fontFamily: "'Georgia', serif", letterSpacing: '1px', marginBottom: '16px'
    },
    formulaHighlight: { color: '#4ecdc4', fontWeight: 'bold' },
    formulaChange: { color: '#ff6b6b' },
    formulaBaseline: { color: '#74b9ff' },
    formulaLegend: {
        display: 'flex', justifyContent: 'center', gap: '24px',
        fontSize: '12px', color: '#aaa'
    },
    comingSoonContent: {
        textAlign: 'center', padding: '40px 20px', color: '#666',
        backgroundColor: '#f8fafc', borderRadius: '10px', border: '2px dashed #e2e8f0'
    },
    comingSoonText: { fontSize: '18px', fontWeight: '600', color: '#64748b', margin: '0 0 10px 0' }
};
