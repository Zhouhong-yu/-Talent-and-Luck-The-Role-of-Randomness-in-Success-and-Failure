/**
 * TvL (Talent vs Luck) Simulation Engine
 * Based on: Pluchino, Biondo, Rapisarda (2018)
 * "Talent vs Luck: the role of randomness in success and failure"
 */

class Agent {
  constructor(id, talent, x, y, initialCapital) {
    this.id = id;
    this.talent = talent;
    this.capital = initialCapital;
    this.x = x;
    this.y = y;
    this.luckyEvents = 0;
    this.unluckyEvents = 0;
    this.luckyExploited = 0;
    this.history = [{ step: 0, capital: initialCapital, lucky: 0, unlucky: 0 }];
  }
}

class Event {
  constructor(type, x, y) {
    this.type = type; // 'lucky' | 'unlucky'
    this.x = x;
    this.y = y;
  }

  move(worldSize) {
    const angle = Math.random() * 2 * Math.PI;
    let nx = this.x + 2 * Math.cos(angle);
    let ny = this.y + 2 * Math.sin(angle);
    this.x = ((nx % worldSize) + worldSize) % worldSize;
    this.y = ((ny % worldSize) + worldSize) % worldSize;
  }
}

class Simulation {
  constructor(params = {}) {
    this.N = params.N ?? 1000;
    this.worldSize = params.worldSize ?? 201;
    this.NE = params.NE ?? 500;
    this.pL = params.pL ?? 0.5;
    this.mT = params.mT ?? 0.6;
    this.sigmaT = params.sigmaT ?? 0.1;
    this.initialCapital = params.initialCapital ?? 10;
    this.totalSteps = params.totalSteps ?? 80; // 40 years, 6-month steps

    this.agents = [];
    this.events = [];
    this.currentStep = 0;
    this.fundingStrategy = null;
    this.fundingAmount = 0;
    this.fundingTargetPct = 0.25;
    this.fundingInterval = 10; // every 5 years

    this.stats = null;
    this._init();
  }

  _init() {
    this.agents = [];
    this.events = [];
    this.currentStep = 0;

    for (let i = 0; i < this.N; i++) {
      const talent = this._sampleNormal(this.mT, this.sigmaT);
      const x = Math.random() * this.worldSize;
      const y = Math.random() * this.worldSize;
      this.agents.push(new Agent(i, talent, x, y, this.initialCapital));
    }

    const nLucky = Math.floor(this.NE * this.pL);
    for (let i = 0; i < this.NE; i++) {
      const type = i < nLucky ? 'lucky' : 'unlucky';
      const x = Math.random() * this.worldSize;
      const y = Math.random() * this.worldSize;
      this.events.push(new Event(type, x, y));
    }

    this._updateStats();
  }

  _sampleNormal(mean, std) {
    let u1 = Math.random();
    let u2 = Math.random();
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, Math.min(1, mean + std * z));
  }

  step() {
    if (this.currentStep >= this.totalSteps) return false;

    for (const evt of this.events) {
      evt.move(this.worldSize);
    }

    // Reset per-step event counters for each agent
    for (const agent of this.agents) {
      for (const evt of this.events) {
        const dx = Math.abs(agent.x - evt.x);
        const dy = Math.abs(agent.y - evt.y);
        const dist = Math.sqrt(
          Math.min(dx, this.worldSize - dx) ** 2 +
          Math.min(dy, this.worldSize - dy) ** 2
        );

        if (dist <= 1) {
          if (evt.type === 'lucky') {
            agent.luckyEvents++;
            if (Math.random() < agent.talent) {
              agent.capital *= 2;
              agent.luckyExploited++;
            }
          } else {
            agent.unluckyEvents++;
            agent.capital /= 2;
          }
        }
      }
    }

    this.currentStep++;

    // Apply periodic funding
    if (this.fundingStrategy && this.fundingAmount > 0 &&
        this.currentStep % this.fundingInterval === 0) {
      this._applyFunding();
    }

    this._updateStats();
    return true;
  }

  _applyFunding() {
    const totalFunds = this.fundingAmount;
    const agents = [...this.agents];

    switch (this.fundingStrategy) {
      case 'egalitarian':
        const each = totalFunds / this.N;
        for (const a of agents) a.capital += each;
        break;

      case 'elitarian':
        agents.sort((a, b) => b.capital - a.capital);
        const topN = Math.floor(this.N * this.fundingTargetPct);
        const eachTop = totalFunds / topN;
        for (let i = 0; i < topN; i++) agents[i].capital += eachTop;
        break;

      case 'mixed':
        agents.sort((a, b) => b.capital - a.capital);
        const topNMix = Math.floor(this.N * this.fundingTargetPct);
        const halfFunds = totalFunds / 2;
        const eachMixTop = halfFunds / topNMix;
        const eachMixRest = halfFunds / (this.N - topNMix);
        for (let i = 0; i < topNMix; i++) agents[i].capital += eachMixTop;
        for (let i = topNMix; i < this.N; i++) agents[i].capital += eachMixRest;
        break;

      case 'random':
        const nRand = Math.floor(this.N * this.fundingTargetPct);
        const eachRand = totalFunds / nRand;
        const shuffled = [...agents].sort(() => Math.random() - 0.5);
        for (let i = 0; i < nRand; i++) shuffled[i].capital += eachRand;
        break;
    }
  }

  _updateStats() {
    const capitals = this.agents.map(a => a.capital);
    const talents = this.agents.map(a => a.talent);
    const sorted = [...capitals].sort((a, b) => b - a);
    const totalCapital = sorted.reduce((s, c) => s + c, 0);

    // Top 20% share
    const top20Idx = Math.floor(this.N * 0.2);
    const top20Share = sorted.slice(0, top20Idx).reduce((s, c) => s + c, 0) / totalCapital;
    const bottom80Share = 1 - top20Share;

    // Most successful agent
    let bestAgent = this.agents[0];
    let worstAgent = this.agents[0];
    let maxTalentAgent = this.agents[0];
    for (const a of this.agents) {
      if (a.capital > bestAgent.capital) bestAgent = a;
      if (a.capital < worstAgent.capital) worstAgent = a;
      if (a.talent > maxTalentAgent.talent) maxTalentAgent = a;
    }

    // Talented people (T > mT + σT) stats
    const tThreshold = this.mT + this.sigmaT;
    const talented = this.agents.filter(a => a.talent > tThreshold);
    const talentedSuccess = talented.filter(a => a.capital > this.initialCapital);

    this.stats = {
      step: this.currentStep,
      bestAgent,
      worstAgent,
      maxTalentAgent,
      top20Share,
      bottom80Share,
      totalCapital,
      capitals,
      talents,
      luckyCounts: this.agents.map(a => a.luckyEvents),
      unluckyCounts: this.agents.map(a => a.unluckyEvents),
      talentedCount: talented.length,
      talentedSuccessCount: talentedSuccess.length,
      capitalDist: this._buildHistogram(capitals, 50),
    };
  }

  _buildHistogram(values, bins) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return { bins: [min], counts: [values.length] };

    const logMin = Math.log(Math.max(min, 0.001));
    const logMax = Math.log(max);
    const step = (logMax - logMin) / bins;
    const edges = [];
    const counts = new Array(bins).fill(0);

    for (let i = 0; i <= bins; i++) {
      edges.push(Math.exp(logMin + i * step));
    }

    for (const v of values) {
      if (v <= 0) continue;
      const idx = Math.min(Math.floor((Math.log(v) - logMin) / step), bins - 1);
      counts[idx]++;
    }

    return { edges, counts };
  }

  runAll() {
    while (this.step()) {}
    return this.stats;
  }

  reset() {
    this._init();
  }
}
