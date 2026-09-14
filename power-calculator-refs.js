/* Typical values for ICC, R² and autocorrelation, shown next to those inputs.
 * Every entry was checked against the full text of its source on 2026-09-14; "quote" is the sentence the range comes from
 * (Greek letters and superscripts restored where PDF text extraction dropped them). Stored for auditing, not displayed. */
window.POWER_REFS = {
  icc: [
    {
      range: '0.20 (maths), 0.17 (reading)',
      context: 'average school-level ICC for student achievement, grades 3 to 8, US state data (varies considerably across states)',
      source: 'Hedges & Hedberg (2013), Evaluation Review',
      url: 'https://files.eric.ed.gov/fulltext/ED557573.pdf',
      quote: 'intraclass correlation estimates in grades 3 to 8 averaged about ρ = 0.20 in mathematics achievement and ρ = 0.17 in reading achievement, but there was considerable variation across states.'
    }
  ],
  r2: [
    {
      range: '80% (maths), 87% (reading)',
      context: 'average share of school-level variance explained by a pretest, US state data',
      source: 'Hedges & Hedberg (2013), Evaluation Review',
      url: 'https://files.eric.ed.gov/fulltext/ED557573.pdf',
      quote: 'A pretest on academic achievement was a substantially more effective covariate than demographic variables, explaining an average of R₂² = 80% of the variation in mathematics achievement at level 2 (the school level) and an average of R₂² = 87% of the variance in reading achievement at level 2'
    },
    {
      range: '64% (maths), 57% (reading)',
      context: 'average share of student-level variance explained by a pretest, US state data',
      source: 'Hedges & Hedberg (2013), Evaluation Review',
      url: 'https://files.eric.ed.gov/fulltext/ED557573.pdf',
      quote: 'while explaining an average of R₁² = 64% of the variance in mathematics achievement at level 1 (the individual level) and an average of R₁² = 57% of the variance in reading achievement at level 1.'
    },
    {
      range: 'About half, one fifth or one tenth as many schools',
      context: 'schools needed once pretests are controlled for, in elementary, middle and high schools respectively',
      source: 'Bloom, Richburg-Hayes & Black (2007), Educational Evaluation and Policy Analysis',
      url: 'https://www.mdrc.org/work/publications/using-covariates-improve-precision',
      quote: 'pretests can reduce the number of randomized schools needed for a given level of precision to about half of what would be needed otherwise for elementary schools, one fifth for middle schools, and one tenth for high schools'
    }
  ],
  rho: [
    {
      range: '0.6 to 0.8',
      context: 'test scores and anthropometric measures (high autocorrelation: always include a baseline)',
      source: 'McKenzie (2012), Journal of Development Economics',
      url: 'https://documents1.worldbank.org/curated/en/333121468147852171/pdf/WPS5639.pdf',
      quote: 'For outcome measures like anthropometric measures or test scores, for which the autocorrelation is high (e.g. ρ=0.6 to 0.8), always include at least one baseline.'
    },
    {
      range: '0.20 to 0.40',
      context: 'business profits, incomes and expenditure (low autocorrelation: prefer ANCOVA or several follow-ups over difference-in-differences)',
      source: 'McKenzie (2012), Journal of Development Economics',
      url: 'https://documents1.worldbank.org/curated/en/333121468147852171/pdf/WPS5639.pdf',
      quote: 'For outcome measures like business profits, incomes, or expenditure, for which the autocorrelation is typically low (e.g. ρ=0.20 to 0.40), it can be optimal to have no baseline at all'
    },
    {
      range: '0.2-0.3',
      context: 'household income and consumption across the datasets reviewed',
      source: 'McKenzie (2012), Journal of Development Economics',
      url: 'https://documents1.worldbank.org/curated/en/333121468147852171/pdf/WPS5639.pdf',
      quote: 'We see from Table 2 that autocorrelations are often in the 0.2-0.3 range for household income and consumption.'
    }
  ]
};
