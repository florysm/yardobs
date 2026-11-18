import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { constructor() { this.messages = { create }; } },
}));

process.env.ANTHROPIC_API_KEY = 'test-key';
const { default: handler } = await import('./insight.js');

// Prompt contract tests (which facts reach which card) come first; the
// cache/failure-policy tests follow.

let ip = 0;
let station = 0;
function call(body) {
  const res = { status: vi.fn(() => res), json: vi.fn(() => res), setHeader: vi.fn(), end: vi.fn() };
  // A fresh IP per call keeps the per-IP rate limiter out of the way.
  const req = { method: 'POST', body, headers: { 'x-forwarded-for': `10.2.0.${++ip}` } };
  return handler(req, res).then(() => res);
}

const reply = (text, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text }] });

// A unique station per test keeps the module-level cache from leaking between tests.
const activity  = () => ({ activity: 'run', activityLabel: 'Running', score: 80, factors: [], current: { temp: 60 }, stationId: `T${++station}` });
const daily     = () => ({ type: 'daily', stationId: `T${++station}`, date: '2026-11-17', current: { temp: 60 } });
const forecast  = () => ({ type: 'forecast-day', stationId: `T${++station}`, date: '2026-11-18', tempMax: 60, tempMin: 40 });

beforeEach(() => create.mockReset());
afterEach(() => vi.useRealTimers());

const outlook = 'evening (6p–9p) 60→57°, slight chance of rain 25%; night (9p–12a) 55→52°, rain likely 65% from 11p';

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

  it('a refusal is a 502, never shown as a narrative', async () => {
    create.mockResolvedValue({ stop_reason: 'refusal', stop_details: { category: null },
      content: [{ type: 'text', text: 'partial' }] });
    const res = await call({ type: 'forecast-day', stationId: 'S4', date: '2026-11-08', units: 'imperial' });
    expect(res.status).toHaveBeenCalledWith(502);
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

  it('daily: no rain line on a dry day, and the model is told to leave rain out', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"narrative":"n","tags":[]}' }] });
    await call({ type: 'daily', stationId: 'S1', date: '2026-11-04', period: 'morning',
      current: { temp: 41, precipRate: 0, precipTotal: 0 }, lookahead: '41→48°, dry', units: 'imperial' });
    const { system, messages } = create.mock.calls[0][0];
    expect(messages[0].content).not.toMatch(/rain/i);
    expect(messages[0].content).toContain('Next 3 hours: 41→48°, dry');
    expect(system).toContain('leave rain out entirely');
  });

  it("daily: compares with this hour last year, with that day's rain", async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"narrative":"n","tags":[]}' }] });
    await call({ type: 'daily', stationId: 'S1', date: '2026-11-18', period: 'afternoon', units: 'imperial',
      current: { temp: 54 }, yoyHourTemp: 50.2,
      yoyReadings: [{ imperial: { tempAvg: 44, precipTotal: 0.12 } }] });
    const prompt = create.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Last year: +4°F vs. this time last year; 0.12" of rain fell that day.');
    expect(prompt).toContain('Reference the year-over-year difference in the final sentence.');
  });

  it("daily: falls back to last year's day average, and says so", async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"narrative":"n","tags":[]}' }] });
    await call({ type: 'daily', stationId: 'S1', date: '2026-11-19', period: 'afternoon', units: 'imperial',
      current: { temp: 54 }, yoyReadings: [{ imperial: { tempAvg: 54, precipTotal: 0 } }] });
    expect(create.mock.calls[0][0].messages[0].content)
      .toContain("Last year: about the same temperature as last year's average for the day;");
  });

  it('daily: rain earlier today is reported as earlier, not as now', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"narrative":"n","tags":[]}' }] });
    await call({ type: 'daily', stationId: 'S1', date: '2026-11-04', period: 'afternoon',
      current: { temp: 50, precipRate: 0, precipTotal: 0.3 }, units: 'imperial' });
    expect(create.mock.calls[0][0].messages[0].content).toContain('Not raining now; 0.30" fell earlier today');
  });

  it('activity: gets the outlook and the same best window the card shows', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
    await call({ activity: 'run', activityLabel: 'Running', score: 55, factors: [{ name: 'Wind', score: 30 }],
      current: { temp: 58, windSpeed: 18 }, outlook, bestWindow: 'Peak 3 PM–6 PM', period: 'afternoon', units: 'imperial' });
    const { system, messages } = create.mock.calls[0][0];
    expect(system).toContain('when should — or shouldn\'t — I do this today?');
    expect(messages[0].content).toContain(`Rest of today by part of day (°F): ${outlook}`);
    expect(messages[0].content).toContain('Best window left today (by score): 3 PM–6 PM');
    // The score is on the card; the model gets words, not numbers to echo.
    expect(messages[0].content).toContain('overall right now: marginal');
    expect(messages[0].content).toContain('Wind (poor)');
    expect(messages[0].content).not.toMatch(/\d+\/100/);
    expect(system).toContain('never quote a score');
  });

  it('daily: says "your yard" only for a real station', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"narrative":"n","tags":[]}' }] });
    await call({ type: 'daily', stationId: 'S5', date: '2026-11-04', current: { temp: 60 }, units: 'imperial' });
    expect(create.mock.calls[0][0].system).toContain('"in your yard"');
    await call({ type: 'daily', stationId: 'S6', date: '2026-11-04', current: { temp: 61 }, sourceType: 'forecast_model', units: 'imperial' });
    expect(create.mock.calls[1][0].system).not.toContain('your yard');
  });
});

describe('preview and Explore', () => {
  it('daily: names the place, not the coordinate cache key', async () => {
    create.mockResolvedValue(reply('{"narrative":"n","tags":[]}'));
    await call({ type: 'daily', stationId: 'geo48.86,2.35', placeName: 'Paris', sourceType: 'forecast_model',
      date: '2026-11-17', current: { temp: 50 }, units: 'metric' });
    const { messages } = create.mock.calls[0][0];
    expect(messages[0].content).toContain('Location: Paris');
    expect(messages[0].content).not.toContain('geo48.86');
  });
});

describe('cache and failure policy', () => {
  it('caches a successful reply so the next identical request skips the model', async () => {
    create.mockResolvedValue(reply('Breezy and mild.'));
    const body = activity();
    const first = await call(body);
    const second = await call(body);
    expect(first.status).toHaveBeenCalledWith(200);
    expect(first.json).toHaveBeenCalledWith({ insight: 'Breezy and mild.' });
    expect(second.json).toHaveBeenCalledWith({ insight: 'Breezy and mild.' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('keeps each card’s response shape', async () => {
    create.mockResolvedValue(reply('Dry all day.'));
    expect((await call(forecast())).json).toHaveBeenCalledWith({ narrative: 'Dry all day.' });

    create.mockResolvedValue(reply('{"narrative":"Calm.","tags":[]}'));
    expect((await call(daily())).json).toHaveBeenCalledWith({ narrative: 'Calm.', tags: [] });
  });

  it('returns 503 on overload and does not cache it', async () => {
    const body = daily();
    create.mockRejectedValueOnce(Object.assign(new Error('529 overloaded'), { status: 529 }));
    const busy = await call(body);
    expect(busy.status).toHaveBeenCalledWith(503);
    expect(busy.json.mock.calls[0][0]).toHaveProperty('error');

    create.mockResolvedValue(reply('{"narrative":"Calm.","tags":[]}'));
    const retry = await call(body);
    expect(retry.status).toHaveBeenCalledWith(200);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('returns 502 for an empty, refused or unparseable reply and does not cache it', async () => {
    const cases = [
      [activity(), reply('')],
      [forecast(), { stop_reason: 'refusal', content: [] }],
      [daily(), reply('{"narrative":"Cut o', 'max_tokens')],
      [daily(), reply('{"narrative":"","tags":[]}')],
    ];
    for (const [body, bad] of cases) {
      create.mockReset();
      create.mockResolvedValueOnce(bad).mockResolvedValueOnce(reply(body.type === 'daily' ? '{"narrative":"Ok.","tags":[]}' : 'Ok.'));
      const res = await call(body);
      expect(res.status).toHaveBeenCalledWith(502);
      expect((await call(body)).status).toHaveBeenCalledWith(200);
      expect(create).toHaveBeenCalledTimes(2);
    }
  });

  it('returns 502 on other API errors', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('bad request'), { status: 400 }));
    expect((await call(activity())).status).toHaveBeenCalledWith(502);
  });

  it('treats an entry from the "future" (clock jumped backward) as expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
    create.mockResolvedValue(reply('First.'));
    const body = activity();
    await call(body);

    vi.setSystemTime(new Date('2026-11-17T11:00:00Z'));
    create.mockResolvedValue(reply('Second.'));
    expect((await call(body)).json).toHaveBeenCalledWith({ insight: 'Second.' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('expires entries after the TTL', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
    create.mockResolvedValue(reply('First.'));
    const body = activity();
    await call(body);
    vi.setSystemTime(new Date('2026-11-17T12:16:00Z'));
    await call(body);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('rate limiting', () => {
  it('refuses the 21st call from one IP within the window', async () => {
    create.mockResolvedValue(reply('Fine.'));
    const body = activity();
    const send = () => {
      const res = { status: vi.fn(() => res), json: vi.fn(() => res), setHeader: vi.fn(), end: vi.fn() };
      return handler({ method: 'POST', body, headers: { 'x-forwarded-for': '10.9.9.9' } }, res).then(() => res);
    };
    for (let i = 0; i < 20; i++) expect((await send()).status).toHaveBeenCalledWith(200);
    expect((await send()).status).toHaveBeenCalledWith(429);
  });
});
