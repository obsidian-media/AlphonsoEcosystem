import { TRUST_STATES } from './trustModel';

export const NOVA_BASE_PACKS = [
  {
    id: 'pack.nova-market-analysis',
    name: 'Nova Market Analysis',
    version: '1.0.0',
    enabled: true,
    permissions: ['analysis.market', 'opportunity.segment', 'strategy.positioning'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Analyze market size and growth potential for a new feature',
      'Segment target audience by value and adoption likelihood',
      'Assess competitive positioning opportunities'
    ]
  },
  {
    id: 'pack.nova-prioritization-matrix',
    name: 'Nova Prioritization Matrix',
    version: '1.0.0',
    enabled: true,
    permissions: ['prioritization.matrix', 'opportunity.rank', 'analysis.impact'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Build impact vs effort prioritization matrix for backlog',
      'Rank features by strategic alignment and user value',
      'Create weighted scoring model for initiative selection'
    ]
  },
  {
    id: 'pack.nova-risk-reward',
    name: 'Nova Risk-Reward Assessment',
    version: '1.0.0',
    enabled: true,
    permissions: ['opportunity.risk', 'analysis.reward', 'strategy.balance'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Evaluate risk-to-reward ratio for a new initiative',
      'Assess downside scenarios and mitigation options',
      'Balance risk appetite with growth potential'
    ]
  },
  {
    id: 'pack.nova-timing-analysis',
    name: 'Nova Timing Analysis',
    version: '1.0.0',
    enabled: true,
    permissions: ['opportunity.timing', 'analysis.window', 'strategy.sequencing'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Identify optimal launch windows for feature releases',
      'Assess market timing for competitive advantage',
      'Evaluate seasonal patterns affecting adoption'
    ]
  },
  {
    id: 'pack.nova-effort-estimation',
    name: 'Nova Effort Estimation',
    version: '1.0.0',
    enabled: true,
    permissions: ['opportunity.effort', 'analysis.complexity', 'prioritization.resource'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Estimate engineering effort for feature implementation',
      'Assess resource requirements across teams',
      'Compare effort estimates against value projections'
    ]
  },
  {
    id: 'pack.nova-strategic-alignment',
    name: 'Nova Strategic Alignment',
    version: '1.0.0',
    enabled: true,
    permissions: ['strategy.alignment', 'opportunity.strategic', 'analysis.goals'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Evaluate feature alignment with product strategy',
      'Score initiatives against company OKRs',
      'Identify high-alignment quick wins'
    ]
  },
  {
    id: 'pack.nova-growth-analysis',
    name: 'Nova Growth Analysis',
    version: '1.0.0',
    enabled: true,
    permissions: ['analysis.growth', 'opportunity.growth', 'strategy.scaling'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Analyze growth potential for user acquisition features',
      'Project adoption curves for new capabilities',
      'Identify scaling opportunities and bottlenecks'
    ]
  },
  {
    id: 'pack.nova-competitive-intelligence',
    name: 'Nova Competitive Intelligence',
    version: '1.0.0',
    enabled: true,
    permissions: ['analysis.competitive', 'opportunity.gap', 'strategy.differentiation'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Identify feature gaps relative to competitors',
      'Assess differentiation opportunities in the market',
      'Track competitor capability evolution'
    ]
  },
  {
    id: 'pack.nova-value-scoring',
    name: 'Nova Value Scoring',
    version: '1.0.0',
    enabled: true,
    permissions: ['opportunity.value', 'prioritization.score', 'analysis.worth'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Score feature proposals by expected user value',
      'Quantify business value of potential initiatives',
      'Compare value scores across competing priorities'
    ]
  },
  {
    id: 'pack.nova-resource-optimization',
    name: 'Nova Resource Optimization',
    version: '1.0.0',
    enabled: true,
    permissions: ['strategy.resource', 'analysis.allocation', 'prioritization.capacity'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Optimize resource allocation across competing initiatives',
      'Identify underutilized capacity for high-value work',
      'Recommend resource shifts for maximum impact'
    ]
  },
  {
    id: 'pack.nova-scenario-modeling',
    name: 'Nova Scenario Modeling',
    version: '1.0.0',
    enabled: true,
    permissions: ['analysis.scenario', 'opportunity.projection', 'strategy.modeling'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Model best-case and worst-case outcomes for initiatives',
      'Create scenario projections for feature launches',
      'Compare scenario outcomes to guide decisions'
    ]
  },
  {
    id: 'pack.nova-decision-support',
    name: 'Nova Decision Support',
    version: '1.0.0',
    enabled: true,
    permissions: ['strategy.decision', 'analysis.support', 'prioritization.recommendation'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Provide data-driven decision support for feature selection',
      'Recommend go/no-go with supporting evidence',
      'Present tradeoff analysis for stakeholder review'
    ]
  },
  {
    id: 'pack.nova-capability-assessment',
    name: 'Nova Capability Assessment',
    version: '1.0.0',
    enabled: true,
    permissions: ['analysis.capability', 'opportunity.readiness', 'strategy.maturity'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Assess team capability readiness for new initiatives',
      'Evaluate technical maturity for feature complexity',
      'Identify capability gaps requiring investment'
    ]
  },
  {
    id: 'pack.nova-trend-forecasting',
    name: 'Nova Trend Forecasting',
    version: '1.0.0',
    enabled: true,
    permissions: ['analysis.forecast', 'opportunity.trend', 'strategy.projection'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Forecast technology adoption trends relevant to product',
      'Project market shifts affecting feature strategy',
      'Identify emerging opportunities from trend data'
    ]
  },
  {
    id: 'pack.nova-portfolio-analysis',
    name: 'Nova Portfolio Analysis',
    version: '1.0.0',
    enabled: true,
    permissions: ['analysis.portfolio', 'prioritization.balance', 'strategy.portfolio'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Analyze initiative portfolio for balance and risk distribution',
      'Recommend portfolio adjustments for optimal mix',
      'Track portfolio health metrics over time'
    ]
  },
  {
    id: 'pack.nova-recommendation-engine',
    name: 'Nova Recommendation Engine',
    version: '1.0.0',
    enabled: true,
    permissions: ['strategy.recommend', 'prioritization.engine', 'analysis.suggestion'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Generate prioritized recommendations from opportunity data',
      'Suggest next-best actions based on scoring models',
      'Provide automated ranking updates as data changes'
    ]
  }
];
