const asyncHandler = require('../middleware/asyncHandler');
const { generateDecisions } = require('../services/decisionEngineService');

/**
 * @route   GET /api/decisions
 * @access  Private
 */
const getDecisions = asyncHandler(async (req, res) => {
  const decisions = await generateDecisions();

  const summary = { High: 0, Medium: 0, Low: 0 };
  decisions.forEach((d) => {
    summary[d.severity] = (summary[d.severity] || 0) + 1;
  });

  res.status(200).json({
    success: true,
    data: decisions,
    summary,
  });
});

module.exports = { getDecisions };
