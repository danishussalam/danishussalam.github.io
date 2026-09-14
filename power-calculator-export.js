/* Power Calculator: text exports built from a compute() result.
 * Pre-registration paragraph, Stata code and an R verification script.
 * Deterministic templates only (no AI). Works in the browser and in the Node tests. */
(function (root) {
  'use strict';
  const PE = root.PowerEngine;
  const X = root.PowerExport = {};
  const f = (x, dp = 3) => PE.util.fmt(x, dp);
  const pct = x => String(Math.round(x * 1000) / 10) + '%';
  const int = x => Number(x).toLocaleString('en-GB');
  const TOOL = "Danish Us-Salam's Power Calculator (danishussalam.github.io/power-calculator.html)";

  const ESTIMATOR = { post: 'comparing follow-up means (POST)', ancova: 'ANCOVA controlling for baseline', did: 'difference-in-differences' };
  const DIST = { uniform: 'uniformly distributed', normal: 'normally distributed', custom: 'custom-correlation' };

  const DESIGN = {
    two_arm: i => `a two-arm individually randomised trial with ${pct(i.P)} of participants assigned to treatment`,
    multi_arm: i => `a multi-arm randomised trial with ${i.arms} treatment arms each compared with a common control (${i.allocRule === 'sqrtk' ? 'control arm √k times each treatment arm' : 'equal allocation'})`,
    factorial: i => `a 2×2 factorial trial powered for the ${i.target === 'interaction' ? 'interaction between the two treatments' : 'main effect of one treatment, assuming no interaction'}`,
    covariate_adjusted: i => `an individually randomised trial with covariate adjustment, assuming covariates explain ${pct(i.r2)} of outcome variance`,
    compliance: i => `an individually randomised trial with imperfect compliance (take-up of ${pct(i.cT)} in the treatment group and ${pct(i.cC)} in the control group; the effect is expressed as ${i.estimand === 'tot' ? 'the effect on those who take up the treatment' : 'the intention-to-treat effect'})`,
    baseline_followup: i => `a randomised trial with ${i.baselines} baseline and ${i.followups} follow-up survey round${i.followups > 1 ? 's' : ''}, analysed by ${ESTIMATOR[i.estimator]}, assuming an outcome autocorrelation of ${f(i.rho, 2)}`,
    within_subject: i => `a ${i.layout === 'crossover' ? 'two-period crossover' : 'within-subject'} design, assuming a correlation of ${f(i.rho, 2)} between each participant's measurements`,
    cluster_rct: i => `a cluster-randomised trial assuming an intra-cluster correlation of ${f(i.icc, 3)}` +
      (i.cv > 0 ? `, a coefficient of variation of cluster size of ${f(i.cv, 2)}` : '') +
      (i.r2c > 0 ? `, cluster-level covariates explaining ${pct(i.r2c)} of between-cluster variance` : '') +
      (i.r2i > 0 ? `, individual-level covariates explaining ${pct(i.r2i)} of within-cluster variance` : ''),
    stepped_wedge: i => `a stepped-wedge cluster-randomised design with ${i.steps} steps, assuming an intra-cluster correlation of ${f(i.icc, 3)}`,
    noninferiority: i => (i.test === 'equiv'
      ? `an equivalence trial tested with two one-sided tests, assuming a true difference of ${f(i.delta)} standard deviations`
      : `a non-inferiority trial, assuming a true difference of ${f(i.delta)} standard deviations`),
    did: i => `a difference-in-differences design with ${i.pre} pre-treatment and ${i.post} post-treatment period${i.post > 1 ? 's' : ''}, assuming AR(1) serial correlation of ${f(i.rho, 2)}`,
    rdd: i => `a ${i.type} regression discontinuity design (linear specification within the bandwidth, ${DIST[i.dist]} running variable${i.type === 'fuzzy' ? `, first-stage jump in treatment probability of ${f(i.jump, 2)}` : ''})`,
    iv: i => `an instrumental-variables design with a first-stage partial R² of ${f(i.r2fs, 3)}`,
    its: i => `an interrupted time series analysed by segmented regression with AR(1) errors (ρ = ${f(i.rho, 2)})`,
    matching: i => `a matched comparison (1:${i.k} matching), assuming matched covariates explain ${pct(i.r2)} of outcome variance and ${pct(i.drop)} of treated units fall outside common support`,
    synthetic_control: i => `a synthetic control design with ${i.donors} donor units`
  };

  function effectPhrase(res) {
    const i = res.inputs, e = res.mde;
    if (res.design === 'noninferiority') return `a margin of ${f(e)} standard deviations`;
    if (res.binary) return `a change in the outcome proportion from ${f(i.p0)} to ${f(e)}`;
    if (res.design === 'its' && i.effectType === 'slope') return `a change in trend of ${f(e)} standard deviations per period`;
    if (res.design === 'compliance' && i.estimand === 'tot') return `an effect of ${f(e)} standard deviations on those who take up the treatment (an intention-to-treat effect of ${f(e * Math.max(i.cT - i.cC, 0))})`;
    return `${f(e)} standard deviations`;
  }

  function samplePhrase(res) {
    const n = res.n, a = res.inputs.attrition || 0;
    const parts = n.breakdown.map(b => `${int(b.value)} ${b.label.toLowerCase()}`).join(', ');
    let s = `${int(n.analysed)} ${n.unit}${parts ? ` (${parts})` : ''}`;
    if (a > 0) s += `, or ${int(n.recruited)} to recruit allowing for ${pct(a)} attrition`;
    return s;
  }

  X.prereg = function (res) {
    const i = res.inputs, def = PE.designs[res.design];
    if (res.solvedFor === 'guidance') {
      const g = res.guidance;
      return `We plan ${DESIGN[res.design](i)}. Inference will use placebo (permutation) tests, for which the smallest attainable p-value is 1/(J + 1) = ${f(g.minP, 4)}; ` +
        (g.achievable ? `this allows testing at the ${pct(i.alpha)} level.` : `this does not allow testing at the ${pct(i.alpha)} level, which would require at least ${g.neededJ} donor units.`) +
        ` Methods follow ${def.citation}.`;
    }
    if (!res.n || res.mde === null || res.power === null) {
      return 'The current settings do not produce a valid result, so no pre-registration text is available. Adjust the inputs and try again.';
    }
    const test = i.sides === 1 ? 'one-sided' : 'two-sided';
    let core;
    if (res.solvedFor === 'n') core = `A sample of ${samplePhrase(res)} provides ${pct(res.power)} power to detect ${effectPhrase(res)} at a ${test} ${pct(i.alpha)} significance level.`;
    else if (res.solvedFor === 'mde') core = `With ${samplePhrase(res)}, the minimum detectable effect at ${pct(i.power)} power and a ${test} ${pct(i.alpha)} significance level is ${effectPhrase(res)}.`;
    else core = `With ${samplePhrase(res)}, the power to detect ${effectPhrase(res)} at a ${test} ${pct(i.alpha)} significance level is ${pct(res.power)}.`;
    let extra = '';
    if (res.design === 'multi_arm' && i.correction !== 'none') {
      extra += ` Each comparison is tested at α = ${f(i.alpha / i.arms, 4)} to account for ${i.arms} comparisons (${i.correction === 'holm' ? 'Holm procedure; the Bonferroni threshold is used as a conservative bound' : 'Bonferroni correction'}).`;
    }
    if (res.approximation) extra += ` This calculation is an approximation: ${res.approximation}`;
    return `We conducted a power calculation for ${DESIGN[res.design](i)}. ${core}${extra} Calculations follow ${def.citation}.`;
  };

  function header(res, c) {
    const i = res.inputs;
    const visible = PE.inputsFor(res.design, i).filter(s => !s.hidden).map(s => `${s.id}=${i[s.id]}`).join(', ');
    const lines = [
      `Generated by ${TOOL}`,
      `Design: ${res.label}`,
      `Inputs: ${visible}`,
      res.solvedFor === 'guidance' ? `Result: smallest placebo p-value ${f(res.guidance.minP, 4)}`
        : `Result: ${res.n ? `analysed ${res.n.analysed} ${res.n.unit}, recruited ${res.n.recruited}` : 'no valid sample'}; effect ${f(res.mde, 4)}; power ${f(res.power, 4)}`,
      `Method: ${PE.designs[res.design].citation}`
    ];
    return lines.map(l => `${c} ${l}`).join('\n') + '\n';
  }

  // ---- Stata ------------------------------------------------------------------
  X.stata = function (res) {
    const i = res.inputs, head = header(res, '*');
    const none = head + '* Stata has no built-in power command for this design.\n* Use the R code export, which reproduces the calculation exactly.\n';
    if (res.solvedFor === 'guidance') return none;
    if (!res.n || res.mde === null) return head + '* No valid result for the current settings.\n';
    const sided = i.sides === 1 ? ' onesided' : '';
    const nopt = (n, extra = '') => (res.solvedFor === 'n' ? `power(${i.power})` : res.solvedFor === 'mde' ? `n(${n}) power(${i.power})` : `n(${n})`) + extra;
    const ratio = P => (Math.abs(P - 0.5) > 1e-9 ? ` nratio(${f(P / (1 - P), 4)})` : '');
    const eff = () => (res.solvedFor === 'mde' ? '0' : `0 ${f(res.mde, 4)}`);
    const twomeans = (sd, alpha, n, extra = '') => `power twomeans ${eff()}, sd(${sd}) ${nopt(n)} alpha(${f(alpha, 5)})${extra}${sided}\n`;
    const twoprop = (alpha, n, extra = '') => `power twoproportions ${res.solvedFor === 'mde' ? i.p0 : `${i.p0} ${f(res.mde, 4)}`}, ${nopt(n)} alpha(${f(alpha, 5)})${extra}${sided}\n`;
    const N = res.n.analysed;
    switch (res.design) {
      case 'two_arm':
        return head + (res.binary ? twoprop(i.alpha, N, ratio(i.P)) : twomeans(1, i.alpha, N, ratio(i.P)));
      case 'multi_arm': {
        const ctrl = res.sizes.nC, arm = res.sizes.nT, a = i.correction === 'none' ? i.alpha : i.alpha / i.arms;
        const extra = arm !== ctrl ? ` nratio(${f(arm / ctrl, 4)})` : '';
        return head + `* One treatment arm versus control, α adjusted for ${i.arms} comparisons\n` +
          (res.binary ? twoprop(a, ctrl + arm, extra) : twomeans(1, a, ctrl + arm, extra));
      }
      case 'factorial':
        return head + (i.target === 'interaction' ? '* Interaction contrast: variance is 4× a main effect, so sd(2)\n' : '* Main effect compares the two halves of the sample\n') +
          (res.binary ? twoprop(i.alpha, N) : twomeans(i.target === 'interaction' ? 2 : 1, i.alpha, N));
      case 'covariate_adjusted':
        return head + `* Residual SD after covariates: sqrt(1 - R2) = ${f(Math.sqrt(1 - i.r2), 4)}\n` +
          (res.binary ? '* Stata has no R2 option for proportions; the unadjusted command is shown\n' + twoprop(i.alpha, N, ratio(i.P)) : twomeans(f(Math.sqrt(1 - i.r2), 4), i.alpha, N, ratio(i.P)));
      case 'baseline_followup': {
        const F = PE.formulas.mckenzie(i.estimator, i.baselines, i.followups, i.rho);
        return head + `* McKenzie (2012) variance factor = ${f(F, 4)}, so the effective SD is sqrt(${f(F, 4)})\n` + twomeans(f(Math.sqrt(F), 4), i.alpha, N, ratio(i.P));
      }
      case 'cluster_rct': {
        const s = res.sizes;
        const kopt = res.solvedFor === 'n' && i.target === 'clusters' ? '' : ` k1(${s.JT}) k2(${s.JC})`;
        const mopt = res.solvedFor === 'n' && i.target === 'size' ? '' : ` m1(${s.m}) m2(${s.m})`;
        const cv = i.cv > 0 ? ` cvcluster(${i.cv})` : '';
        const note = (i.r2c > 0 || i.r2i > 0) ? '* Stata\'s power command does not take covariate R2, so this command ignores it and will need more clusters.\n' : '';
        const opts = `, cluster${kopt}${mopt} rho(${i.icc})${cv} ${res.solvedFor === 'power' ? '' : `power(${i.power}) `}alpha(${f(i.alpha, 5)})${sided}`;
        const cmd = res.binary
          ? `power twoproportions ${res.solvedFor === 'mde' ? i.p0 : `${i.p0} ${f(res.mde, 4)}`}${opts}\n`
          : `power twomeans ${eff()}${opts.replace(', cluster', ', sd(1) cluster')}\n`;
        const zNote = '* Stata uses normal (z) critical values for cluster designs; this calculator uses a t test with J - 2 degrees of freedom\n* (PowerUp!), so Stata may report one or two fewer clusters or slightly smaller clusters.\n';
        return head + zNote + note + cmd;
      }
      case 'within_subject':
        return head + `power pairedmeans ${eff()}, sd(1) corr(${i.rho}) ${nopt(N)} alpha(${f(i.alpha, 5)})${sided}\n`;
      default:
        return none;
    }
  };

  // ---- R ------------------------------------------------------------------------
  const tail = `crit <- qt(1 - alpha / sides, df)
power <- pt(effect / se - crit, df) + if (sides == 2) pt(-effect / se - crit, df) else 0
cat("Power at the reported sample and effect:", round(power, 4), "\\n")
`;
  const binaryTail = `pbar <- (n_t * p1 + n_c * p0) / (n_t + n_c)
v0 <- mult * pbar * (1 - pbar) * (1 / n_t + 1 / n_c)
v1 <- mult * (p1 * (1 - p1) / n_t + p0 * (1 - p0) / n_c)
z <- qnorm(1 - alpha / sides)
power <- pnorm((abs(p1 - p0) - z * sqrt(v0)) / sqrt(v1)) + if (sides == 2) pnorm((-abs(p1 - p0) - z * sqrt(v0)) / sqrt(v1)) else 0
cat("Power at the reported sample and effect:", round(power, 4), "\\n")
`;

  X.r = function (res) {
    const i = res.inputs, head = header(res, '#');
    if (res.solvedFor === 'guidance') {
      return head + `donors <- ${i.donors}\nalpha <- ${i.alpha}\nmin_p <- 1 / (donors + 1)\ncat("Smallest attainable placebo p-value:", round(min_p, 4), "\\n")\ncat("Test at alpha achievable:", min_p <= alpha, "\\n")\n`;
    }
    if (!res.n || res.mde === null) return head + '# No valid result for the current settings.\n';
    const s = res.sizes, e = res.mde;
    const common = `alpha <- ${i.alpha}\nsides <- ${i.sides}\n`;
    const two = (multExpr, dfExpr, alphaExpr) => {
      const a = alphaExpr ? `alpha <- ${alphaExpr}\n` : '';
      if (res.binary) return `n_t <- ${s.nT}\nn_c <- ${s.nC}\np0 <- ${i.p0}\np1 <- ${e}\n${multExpr}\n${a}${binaryTail}`;
      return `n_t <- ${s.nT}\nn_c <- ${s.nC}\neffect <- ${e}\n${multExpr}\nse <- sqrt(mult * (1 / n_t + 1 / n_c))\ndf <- ${dfExpr}\n${a}${tail}`;
    };
    let body;
    switch (res.design) {
      case 'two_arm': body = two('mult <- 1', 'n_t + n_c - 2'); break;
      case 'multi_arm': body = two('mult <- 1', `${s.total} - ${i.arms} - 1`, i.correction === 'none' ? null : `${i.alpha} / ${i.arms}  # adjusted for ${i.arms} comparisons`); break;
      case 'factorial': body = two(`mult <- ${i.target === 'interaction' ? 4 : 1}  # interaction contrast has 4x the variance of a main effect`, 'n_t + n_c - 4'); break;
      case 'covariate_adjusted': body = two(`r2 <- ${i.r2}\nmult <- 1 - r2`, `n_t + n_c - 2 - ${i.covariates}`); break;
      case 'compliance':
        body = `n_t <- ${s.nT}\nn_c <- ${s.nC}\ntake_up_t <- ${i.cT}\ntake_up_c <- ${i.cC}\neffect <- ${i.estimand === 'tot' ? `${e} * (take_up_t - take_up_c)  # ITT effect` : e}\nse <- sqrt(1 / n_t + 1 / n_c)\ndf <- n_t + n_c - 2\n${tail}`;
        break;
      case 'baseline_followup': {
        const m = i.baselines, r = i.followups;
        const expr = i.estimator === 'post' || m === 0 ? '(1 + (r - 1) * rho) / r'
          : i.estimator === 'did' ? '(1 + (r - 1) * rho) / r + (1 + (m - 1) * rho) / m - 2 * rho'
          : '(1 + (r - 1) * rho) / r - m * rho^2 / (1 + (m - 1) * rho)';
        body = two(`m <- ${m}\nr <- ${r}\nrho <- ${i.rho}\nmult <- ${expr}  # McKenzie (2012)`, 'n_t + n_c - 2');
        break;
      }
      case 'cluster_rct':
        body = `k_t <- ${s.JT}\nk_c <- ${s.JC}\nm <- ${s.m}\nn_t <- k_t * m\nn_c <- k_c * m\nicc <- ${i.icc}\ncv <- ${i.cv}\nr2c <- ${i.r2c}\nr2i <- ${i.r2i}\n` +
          `mult <- (m * icc * (1 - r2c) + (1 - icc) * (1 - r2i)) * (1 + ((cv^2 + 1) * m - 1) * icc) / (1 + (m - 1) * icc)\n` +
          (res.binary ? `p0 <- ${i.p0}\np1 <- ${e}\n${binaryTail}` : `effect <- ${e}\nse <- sqrt(mult * (1 / n_t + 1 / n_c))\ndf <- k_t + k_c - 2\n${tail}`);
        break;
      case 'within_subject':
        body = `n <- ${s.total}\nrho <- ${i.rho}\neffect <- ${e}\nse <- sqrt(2 * (1 - rho) / n)\ndf <- n - 1\n${tail}`;
        break;
      case 'stepped_wedge':
        body = `I <- ${s.I}\nS <- ${i.steps}\nnpc <- ${s.npc}\nicc <- ${i.icc}\neffect <- ${e}\n` +
          `T <- S + 1\nsigma2 <- (1 - icc) / npc\ntau2 <- icc\n` +
          `X <- t(sapply(0:(S - 1), function(g) as.numeric(0:S >= g + 1)))\nif (S == 1) X <- matrix(X, nrow = 1)\n` +
          `X <- X[rep(1:S, each = I / S), , drop = FALSE]\n` +
          `U <- sum(X); W <- sum(colSums(X)^2); V <- sum(rowSums(X)^2)\n` +
          `var_theta <- I * sigma2 * (sigma2 + T * tau2) / ((I * U - W) * sigma2 + (U^2 + I * T * U - T * W - I * V) * tau2)  # Hussey & Hughes (2007)\n` +
          `se <- sqrt(var_theta)\ndf <- Inf\n${tail}`;
        break;
      case 'noninferiority':
        body = `n_t <- ${s.nT}\nn_c <- ${s.nC}\nmargin <- ${e}\ndelta <- ${i.delta}\nse <- sqrt(1 / n_t + 1 / n_c)\ndf <- n_t + n_c - 2\ncrit <- qt(1 - alpha, df)\n` +
          (i.test === 'equiv'
            ? 'power <- max(0, pt((margin - delta) / se - crit, df) + pt((margin + delta) / se - crit, df) - 1)  # two one-sided tests\n'
            : 'power <- pt((delta + margin) / se - crit, df)  # non-inferiority\n') +
          'cat("Power at the reported sample and effect:", round(power, 4), "\\n")\n';
        break;
      case 'did':
        body = `n_t <- ${s.nT}\nn_c <- ${s.nC}\npre <- ${i.pre}\npost <- ${i.post}\nrho <- ${i.rho}\nsigma <- ${i.sigma}\neffect <- ${e}\n` +
          `cov_ar1 <- function(s, t) sigma^2 * rho^abs(s - t)\n` +
          `pairs_mean <- function(idx) { if (length(idx) < 2) return(0); g <- expand.grid(s = idx, t = idx); g <- g[g$s != g$t, ]; mean(cov_ar1(g$s, g$t)) }\n` +
          `psi_b <- pairs_mean(1:pre)\npsi_a <- pairs_mean((pre + 1):(pre + post))\npsi_x <- mean(outer(1:pre, (pre + 1):(pre + post), cov_ar1))\n` +
          `mult <- (pre + post) / (pre * post) * sigma^2 + (pre - 1) / pre * psi_b + (post - 1) / post * psi_a - 2 * psi_x  # Burlig, Preonas & Woerman (2020)\n` +
          `se <- sqrt(mult * (1 / n_t + 1 / n_c))\ndf <- n_t + n_c - 2\n${tail}`;
        break;
      case 'rdd': {
        const rho = PE.formulas.rddRho(i.dist, i.P, i.rhoTS);
        body = two(`rho_ts <- ${rho}\n${i.type === 'fuzzy' ? `jump <- ${i.jump}\n` : ''}mult <- 1 / (1 - rho_ts^2)${i.type === 'fuzzy' ? ' / jump^2' : ''}  # Schochet (2008)`, 'n_t + n_c - 3');
        break;
      }
      case 'iv': body = two(`r2fs <- ${i.r2fs}\nmult <- 1 / r2fs`, `n_t + n_c - 2 - ${i.instruments}`); break;
      case 'its':
        body = `T0 <- ${s.T0}\nT1 <- ${s.T1}\nrho <- ${i.rho}\neffect <- ${e}\n` +
          `tt <- 1:(T0 + T1)\npost <- as.numeric(tt > T0)\nX <- cbind(1, tt, post, post * (tt - T0 - 1))\n` +
          `Sigma <- rho^abs(outer(tt, tt, "-"))\nV <- solve(t(X) %*% solve(Sigma) %*% X)\n` +
          `se <- sqrt(V[${i.effectType === 'slope' ? 4 : 3}, ${i.effectType === 'slope' ? 4 : 3}])\ndf <- T0 + T1 - 4\n${tail}`;
        break;
      case 'matching': body = two(`r2 <- ${i.r2}\nmult <- 1 - r2`, 'n_t + n_c - 2'); break;
      default: body = '# No R code for this design.\n';
    }
    return head + common + body;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
