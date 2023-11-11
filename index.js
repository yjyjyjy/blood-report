const functions = require('@google-cloud/functions-framework');
const { bloodTestMetrics } = require('./bloodTestMetrics');

function checkRange(value, metric, highRisk, gender) {
  if (value === undefined) {
    return 'Metric not available';
  }

  let range = metric;
  if (highRisk && metric.highRisk) {
    range = metric.highRisk;
  } else if (!highRisk && metric.lowRisk) {
    range = metric.lowRisk;
  } else if (gender && metric[gender]) {
    range = metric[gender];
  }

  const { optimalMin, optimalMax, attentionMin, attentionMax, urgentMin, urgentMax, directionOfGood } = range;

  if (directionOfGood === 'low') {
    if (value <= (optimalMax || Number.POSITIVE_INFINITY)) return 'Optimal range';
    if (value <= (attentionMax || Number.POSITIVE_INFINITY)) return 'Needs Attention - High';
    return 'Urgent Action - High';
  } else if (directionOfGood === 'high') {
    if (value >= (optimalMin || Number.NEGATIVE_INFINITY)) return 'Optimal range';
    if (value >= (attentionMin || Number.NEGATIVE_INFINITY)) return 'Needs Attention - Low';
    return 'Urgent Action - Low';
  } else {
    if ((optimalMin === undefined || value >= optimalMin) && (optimalMax === undefined || value <= optimalMax)) {
      return 'Optimal range';
    }
    if (value < optimalMin) {
      if (attentionMin !== undefined && value < attentionMin) return 'Urgent Action - Low';
      return 'Needs Attention - Low';
    }
    if (value > optimalMax) {
      if (attentionMax !== undefined && value > attentionMax) return 'Urgent Action - High';
      return 'Needs Attention - High';
    }
  }

  return 'Needs Attention';
}

functions.http('classifylabresults', async (req, res) => {
  const { highRisk, gender, ...labResults } = req.body;
  const categoriesSummary = {};
  const metricsOutput = {};

  Object.entries(bloodTestMetrics).forEach(([metric, details]) => {
    const value = labResults[metric];
    const category = details.category;

    if (!metricsOutput[category]) {
      metricsOutput[category] = { metrics: {} };
      categoriesSummary[category] = '';
    }

    const rangeStatus = checkRange(value, details, highRisk, gender);
    metricsOutput[category].metrics[metric] = { ...details, value, rangeStatus };

    if (rangeStatus.includes('Optimal')) {
      categoriesSummary[category] += `${details.fullname} is within the optimal range. `;
    } else if (rangeStatus.includes('Needs Attention') || rangeStatus.includes('Urgent Action')) {
      const severity = rangeStatus.includes('Urgent Action') ? 'requires urgent medical attention' : 'needs attention';
      const interpretation = rangeStatus.includes('Low') ? details.interpretationLowAttention : details.interpretationHighAttention;
      let optimalRange = '';
      if (details.directionOfGood === 'low') {
        optimalRange = `Ideally, this should be under ${details.optimalMax}.`;
      } else if (details.directionOfGood === 'high') {
        optimalRange = `Ideally, this should be above ${details.optimalMin}.`;
      } else {
        optimalRange = `The optimal range is ${details.optimalMin} - ${details.optimalMax}.`;
      }
      categoriesSummary[category] += `${details.fullname} is out of the optimal range and ${severity}. Yours is ${value}. ${optimalRange} ${interpretation} `;
    }
  });

  const summary = Object.entries(categoriesSummary).map(([category, text]) => `${category}:\n\n${text}`).join('\n');

  res.json({ metrics: metricsOutput, summary });
});
