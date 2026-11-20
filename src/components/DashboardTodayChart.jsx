import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';

// Temperature since midnight, for the Detailed dashboard's "Today so far" card.
// Its own file so Recharts loads only when that card is on screen (see the
// lazy import in DashboardView), not with every dashboard.
export default function DashboardTodayChart({ points, color }) {
  return (
    <ResponsiveContainer width="100%" height={64}>
      <LineChart data={points} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
        <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
        <Line type="monotone" dataKey="temp" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
