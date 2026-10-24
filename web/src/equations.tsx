import katex from "katex";
import "katex/dist/katex.min.css";

type EquationSpec = { label: string; latex: string; explanation: string };
const equations: Record<string, EquationSpec[]> = {
  target: [
    {
      label: "Next-session return",
      latex: String.raw`r_{t+1}=\frac{P_{t+1}}{P_t}-1`,
      explanation:
        "Pₜ is the observed adjusted close at the forecast origin; rₜ₊₁ is the next observed session’s decimal return.",
    },
    {
      label: "Reconstructed closing value",
      latex: String.raw`\widehat P_{t+1}=P_t\left(1+\widehat r_{t+1}\right)`,
      explanation:
        "Each model’s predicted return is converted to an adjusted closing value. Stock values use INR; Nifty values use index points.",
    },
  ],
  validation: [
    {
      label: "Expanding walk-forward split",
      latex: String.raw`\mathcal D_k^{\rm train}=\{(x_t,r_{t+1}):d_{t+1}<b_k\},\quad \mathcal D_k^{\rm test}=\{(x_t,r_{t+1}):b_k\le d_{t+1}<b_{k+1}\}`,
      explanation:
        "dₜ₊₁ is the target-session date and bₖ is a quarterly boundary. Training expands; each next quarter is held out. The final quarter is partial.",
    },
    {
      label: "Training-only feature scaling for Ridge",
      latex: String.raw`z_{t,j}=\frac{x_{t,j}-\mu_{k,j}^{\rm train}}{\sigma_{k,j}^{\rm train}}`,
      explanation:
        "Feature means and standard deviations are fitted on that quarter’s training set only. Constant features use a scale of 1, as in StandardScaler.",
    },
  ],
  Naive: [
    {
      label: "Previous-close baseline",
      latex: String.raw`\widehat r_{t+1}^{\rm naive}=0,\qquad \widehat P_{t+1}^{\rm naive}=P_t`,
      explanation:
        "A zero-return forecast keeps tomorrow’s value equal to the last observed close.",
    },
  ],
  Ridge: [
    {
      label: "Regularized linear regression",
      latex: String.raw`(\widehat a,\widehat\beta)=\underset{a,\beta}{\arg\min}\left\{\sum_{i\in\mathcal D_k^{\rm train}}(r_{i+1}-a-z_i^\top\beta)^2+10\lVert\beta\rVert_2^2\right\}`,
      explanation:
        "zᵢ contains training-standardized features. The coefficient penalty is alpha = 10; the intercept a is not penalized.",
    },
    {
      label: "Ridge forecast",
      latex: String.raw`\widehat r_{t+1}=\widehat a+z_t^\top\widehat\beta`,
      explanation:
        "The fitted coefficients are held fixed throughout the test quarter.",
    },
  ],
  ARIMA: [
    {
      label: "ARIMA(1,0,1) on scaled returns",
      latex: String.raw`s_t=100r_t,\qquad s_t-\mu=\phi(s_{t-1}-\mu)+\varepsilon_t+\theta\varepsilon_{t-1}`,
      explanation:
        "μ is the mean term, φ the autoregressive coefficient, θ the moving-average coefficient, and ε the innovation. Returns are multiplied by 100 for numerical conditioning; the forecast is divided by 100 afterward. No differencing is used (d = 0).",
    },
  ],
  RandomForest: [
    {
      label: "Average of regression trees",
      latex: String.raw`\widehat r_{t+1}=\frac{1}{150}\sum_{b=1}^{150}T_b(x_t)`,
      explanation:
        "Tᵦ is a regression tree trained on a bootstrap sample. Trees have maximum depth 6 and minimum leaf size 15; their return predictions are averaged.",
    },
  ],
  XGBoost: [
    {
      label: "Sequential boosted-tree forecast",
      latex: String.raw`F_0(x)=b_0,\qquad F_m(x)=F_{m-1}(x)+0.03f_m(x),\qquad \widehat r_{t+1}=F_{150}(x_t)`,
      explanation:
        "b₀ is the fitted base score; fₘ is the next corrective tree. The model uses 150 trees of maximum depth 3 and a learning rate of 0.03.",
    },
    {
      label: "Squared-error loss and leaf-weight penalty",
      latex: String.raw`\ell(y,F)=\tfrac12(y-F)^2,\qquad \Omega(f_m)=\frac{10}{2}\sum_{j=1}^{L_m}w_{m,j}^2`,
      explanation:
        "Training minimizes squared-error loss with L2 leaf-weight regularization (lambda = 10). Lₘ is the number of leaves and wₘ,ⱼ a leaf weight. Row and feature subsampling are both 0.8; minimum child weight is 15.",
    },
  ],
  metrics: [
    {
      label: "Closing-value errors",
      latex: String.raw`e_i=\widehat P_i-P_i,\qquad \mathrm{MAE}=\frac1n\sum_{i=1}^n|e_i|,\qquad \mathrm{RMSE}=\sqrt{\frac1n\sum_{i=1}^ne_i^2}`,
      explanation:
        "n is the number of forecasts for one asset under the selected filters. Lower is better. MAE is the primary comparison; RMSE gives larger misses more weight.",
    },
    {
      label: "Improvement over naive",
      latex: String.raw`\mathrm{Skill}_{\rm MAE}=100\left(1-\frac{\mathrm{MAE}_{\rm model}}{\mathrm{MAE}_{\rm naive}}\right)\%`,
      explanation:
        "Positive skill means smaller MAE than naive on the same sessions; negative skill means larger MAE. It is undefined when naive MAE is zero. RMSE skill uses the same expression with RMSE.",
    },
    {
      label: "Direction score with neutral half-credit",
      latex: String.raw`\mathrm{DA}=\frac{100}{n}\sum_{i=1}^n\begin{cases}1,&r_i\widehat r_i>0\\[2pt]0,&r_i\widehat r_i<0\\[2pt]\tfrac12,&r_i\widehat r_i=0\end{cases}\%`,
      explanation:
        "Matching signs score 1, opposite signs 0, and a zero actual or predicted return scores ½. Naive has no directional coverage, so its direction score is shown as N/A rather than presented as a directional forecast.",
    },
    {
      label: "Equal-weight comparison across assets",
      latex: String.raw`\overline{\mathrm{Skill}}=\frac1A\sum_{a=1}^{A}\mathrm{Skill}_a`,
      explanation:
        "The full report averages baseline-relative skill equally across assets with defined scores. Raw rupee errors and index-point errors are never pooled. The current stock table remains per asset.",
    },
  ],
  data: [
    {
      label: "Backward alignment of context data",
      latex: String.raw`u^*(t)=\max\{u:a_u\le c_t\},\qquad x_t^{\rm context}=v_{u^*(t)}`,
      explanation:
        "vᵤ is a context observation, aᵤ its assumed availability time, and cₜ the forecast cutoff (18:00 IST). Only the latest observation available by the cutoff is used, subject to the seven-day age limit. Availability assumptions and calendar checks still need independent verification.",
    },
  ],
};

// Only static, reviewed formulas are rendered; no user or API HTML is accepted.
export function Equations({ section }: { section: string }) {
  return (
    <div className="equation-group">
      {equations[section].map(({ label, latex, explanation }) => (
        <figure className="method-equation" key={label}>
          <figcaption>{label}</figcaption>
          <div
            className="equation-scroll"
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(latex, {
                displayMode: true,
                throwOnError: true,
                trust: false,
                output: "htmlAndMathml",
              }),
            }}
          />
          <p>{explanation}</p>
        </figure>
      ))}
    </div>
  );
}
