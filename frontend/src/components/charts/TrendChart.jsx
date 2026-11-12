import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatTime } from '../../utils/format.js';

function ChartTooltip({ active, payload, label, unit, name }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card" style={{ padding: '8px 10px', boxShadow: 'var(--shadow)', fontSize: 12 }}>
      <div className="faint">{formatTime(label, true)}</div>
      <div>
        {name}: <strong className="num">{payload[0].value}</strong> {unit}
      </div>
    </div>
  );
}

/**
 * Biểu đồ xu hướng MỘT chuỗi số liệu (một trục y). Hai đại lượng khác đơn vị
 * được vẽ thành hai biểu đồ riêng thay vì biểu đồ hai trục.
 */
export function TrendChart({ data, dataKey, name, unit, color = 'var(--series-1)', height = 200, domain }) {
  return (
    <div style={{ width: '100%', height }} role="img" aria-label={`Biểu đồ ${name} theo thời gian`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="ts"
            tickFormatter={(t) => formatTime(t, true)}
            tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
            domain={domain ?? ['auto', 'auto']}
          />
          <Tooltip
            content={<ChartTooltip unit={unit} name={name} />}
            cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '3 3' }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={color}
            fillOpacity={0.08}
            isAnimationActive={false}
            activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
