import { describe, it, expect, vi, beforeEach } from 'vitest';

// Captures what each handler sends the model, so the prompt contract (which
// facts reach which card) is pinned without spending a real API call.
const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { constructor() { this.messages = { create }; } },
}));

const { default: handler } = await import('./insight.js');

function call(body) {
  const res = { status: vi.fn(() => res), json: vi.fn(() => res), setHeader: vi.fn(), end: vi.fn() };
  const req = { method: 'POST', headers: { 'x-forwarded-for': `10.0.0.${Math.random()}` }, body };
  return handler(req, res).then(() => res);
}

const outlook = 'evening (6p–9p) 60→57°, slight chance of rain 25%; night (9p–12a) 55→52°, rain likely 65% from 11p';

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test';
  create.mockReset();
});

describe('insight handlers', () => {
  it('forecast-day: today covers only the rest of the day, by part', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
    const res = await call({ type: 'forecast-day', stationId: 'S1', date: '2026-11-04', dayLabel: 'Today',
      tempMax: 65, tempMin: 45, pop: 65, conditions: 'Cloudy', outlook, isToday: true, dayPart: 'evening',
      aqi: 30, units: 'imperial' });
    const { system, messages } = create.mock.calls[0][0];
    expect(system).toContain('rest of today, starting now');
    expect(system).toContain('Describe rather than plan');
    expect(messages[0].content).toContain('the rest of the day, from evening');
    expect(messages[0].content).toContain(outlook);
    // The day's high is likely behind us — don't hand it over to be restated.
    expect(messages[0].content).not.toContain('high 65');
    expect(res.json).toHaveBeenCalledWith({ narrative: 'ok' });
  });

  it('forecast-day: other days get the full-day overview with high/low', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
    await call({ type: 'forecast-day', stationId: 'S1', date: '2026-11-06', dayLabel: 'Friday',
      tempMax: 62, tempMin: 44, pop: 10, outlook: 'morning (8a–12p) 50→58°, dry', isToday: false, units: 'imperial' });
    const { system, messages } = create.mock.calls[0][0];
    expect(system).not.toContain('rest of today');
    expect(messages[0].content).toContain('Day: Friday');
    expect(messages[0].content).toContain('high 62°F');
  });

  it('calls Haiku 5.5 with thinking off and merges the JSON format into output_config', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"narrative":"n","tags":[]}' }] });
    await call({ type: 'daily', stationId: 'S2', date: '2026-11-04', current: { temp: 60 }, units: 'imperial' });
    const params = create.mock.calls[0][0];
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.thinking).toEqual({ type: 'disabled' });
    expect(params.output_config.effort).toBe('low');
    expect(params.output_config.format.type).toBe('json_schema');
  });

  it('reads the text block by type, not position', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn',
      content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'narrative' }] });
    const res = await call({ type: 'forecast-day', stationId: 'S3', date: '2026-11-07', units: 'imperial' });
    expect(res.json).toHaveBeenCalledWith({ narrative: 'narrative' });
  });

  it('a refusal degrades to an empty narrative', async () => {
    create.mockResolvedValue({ stop_reason: 'refusal', stop_details: { category: null },
      content: [{ type: 'text', text: 'partial' }] });
    const res = await call({ type: 'forecast-day', stationId: 'S4', date: '2026-11-08', units: 'imperial' });
    expect(res.json).toHaveBeenCalledWith({ narrative: '' });
  });

  it('daily: right now plus the next few hours, nothing later', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"narrative":"n","tags":[]}' }] });
    await call({ type: 'daily', stationId: 'S1', date: '2026-11-04', period: 'evening',
      current: { temp: 57 }, lookahead: '57→52°, rain likely 65% from 11p', units: 'imperial' });
    const { system, messages } = create.mock.calls[0][0];
    expect(system).toContain('what\'s it doing right now?');
    expect(messages[0].content).toContain('Next 3 hours: 57→52°, rain likely 65% from 11p');
    expect(messages[0].content).toContain('Time of day: evening');
  });

  it('activity: gets the outlook and the same best window the card shows', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
    await call({ activity: 'run', activityLabel: 'Running', score: 55, factors: [{ name: 'Wind', score: 30 }],
      current: { temp: 58, windSpeed: 18 }, outlook, bestWindow: 'Peak 3 PM–6 PM', period: 'afternoon', units: 'imperial' });
    const { system, messages } = create.mock.calls[0][0];
    expect(system).toContain('when should — or shouldn\'t — I do this today?');
    expect(messages[0].content).toContain(`Rest of today by part of day (°F): ${outlook}`);
    expect(messages[0].content).toContain('Best window left today (by score): 3 PM–6 PM');
  });
});
