import { useState } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { CHART_COLOR, RADIUS, SHADOW } from "../../theme/tokens";
import { compactNumber } from "./AdminUI";

// Charts built from plain views (no chart library). Single series only, so there's
// no legend: the panel title names what is plotted. Marks follow the dataviz specs:
// bars capped at 24px with a 4px rounded data end, a 2px surface gap between
// neighbors, recessive hairline grid, hover tooltip, and a table view.

const CHART_HEIGHT = 160;

function niceMax(max: number) {
  if (max <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= max / 4)! * magnitude;
  return Math.ceil(max / step) * step;
}

function shortDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

export function DailyColumnChart({ data, unit }: { data: { day: string; count: number }[]; unit: string }) {
  const { colors, scheme } = useTheme();
  const fill = CHART_COLOR[scheme];
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [width, setWidth] = useState(0);

  const max = niceMax(Math.max(0, ...data.map((d) => d.count)));
  const total = data.reduce((s, d) => s + d.count, 0);
  const slot = data.length > 0 ? width / data.length : 0;
  const barWidth = Math.max(2, Math.min(24, slot - 2));
  const ticks = [max, max / 2, 0];
  const labelIdx = data.length > 1 ? [0, Math.floor((data.length - 1) / 2), data.length - 1] : [0];

  return (
    <View>
      <View style={styles.chartTop}>
        <Text style={[styles.total, { color: colors.ink }]}>
          {total.toLocaleString()} <Text style={[styles.totalUnit, { color: colors.muted }]}>{unit} in {data.length} days</Text>
        </Text>
        <TouchableOpacity onPress={() => setShowTable((s) => !s)} accessibilityRole="button">
          <Text style={[styles.toggle, { color: colors.primary }]}>{showTable ? "Show chart" : "Show table"}</Text>
        </TouchableOpacity>
      </View>

      {showTable ? (
        <View style={[styles.table, { borderColor: colors.border }]}>
          {[...data].reverse().map((d) => (
            <View key={d.day} style={[styles.tableRow, { borderColor: colors.divider }]}>
              <Text style={[styles.tableCell, { color: colors.muted }]}>{shortDay(d.day)}</Text>
              <Text style={[styles.tableCell, { color: colors.ink }]}>{d.count.toLocaleString()}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.plotRow}>
          <View style={[styles.yAxis, { height: CHART_HEIGHT }]}>
            {ticks.map((t) => (
              <Text key={t} style={[styles.axisText, { color: colors.muted }]}>
                {compactNumber(t)}
              </Text>
            ))}
          </View>
          <View style={styles.flex1}>
            <View
              style={[styles.plot, { height: CHART_HEIGHT }]}
              onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
              accessibilityLabel={`${unit} per day, ${total} in total`}
            >
              {ticks.map((t) => (
                <View
                  key={t}
                  style={[styles.gridLine, { top: CHART_HEIGHT - (t / max) * CHART_HEIGHT, backgroundColor: t === 0 ? colors.border : colors.divider }]}
                />
              ))}
              <View style={styles.bars}>
                {data.map((d, i) => {
                  const h = d.count === 0 ? 0 : Math.max(3, (d.count / max) * CHART_HEIGHT);
                  return (
                    <Pressable
                      key={d.day}
                      style={[styles.slot, { width: slot }]}
                      onHoverIn={() => setHover(i)}
                      onHoverOut={() => setHover((cur) => (cur === i ? null : cur))}
                      onPressIn={() => setHover(i)}
                      accessibilityLabel={`${shortDay(d.day)}: ${d.count} ${unit}`}
                    >
                      <View
                        style={[
                          styles.bar,
                          { height: h, width: barWidth, backgroundColor: fill, opacity: hover === null || hover === i ? 1 : 0.55 },
                        ]}
                      />
                    </Pressable>
                  );
                })}
              </View>
              {hover !== null && data[hover] && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.tooltip,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                    { left: Math.min(Math.max(0, hover * slot + slot / 2 - 60), Math.max(0, width - 120)) },
                  ]}
                >
                  <Text style={[styles.tooltipDay, { color: colors.muted }]}>{shortDay(data[hover].day)}</Text>
                  <Text style={[styles.tooltipValue, { color: colors.ink }]}>
                    {data[hover].count.toLocaleString()} {unit}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.xAxis}>
              {labelIdx.map((i) => (
                <Text key={i} style={[styles.axisText, { color: colors.muted }]}>
                  {data[i] ? shortDay(data[i].day) : ""}
                </Text>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// Ranked horizontal bars (e.g. popular destinations). Value at the bar tip.
export function BarList({ items, unit }: { items: { label: string; value: number }[]; unit: string }) {
  const { colors, scheme } = useTheme();
  const fill = CHART_COLOR[scheme];
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) {
    return <Text style={[styles.noData, { color: colors.muted }]}>No data for this period yet.</Text>;
  }
  return (
    <View style={styles.barList}>
      {items.map((item) => (
        <View key={item.label} style={styles.barRow} accessibilityLabel={`${item.label}: ${item.value} ${unit}`}>
          <Text style={[styles.barLabel, { color: colors.ink }]} numberOfLines={1}>
            {item.label}
          </Text>
          <View style={styles.barTrack}>
            {/* Longest bar spans 85% of the track so its value label always fits after it. */}
            <View style={[styles.hBar, { width: `${(item.value / max) * 85}%`, backgroundColor: fill }]} />
            <Text style={[styles.barValue, { color: colors.muted }]}>{item.value.toLocaleString()}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chartTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, gap: 12 },
  total: { fontSize: 22, fontWeight: "700" },
  totalUnit: { fontSize: 13, fontWeight: "500" },
  toggle: { fontSize: 13, fontWeight: "700" },
  plotRow: { flexDirection: "row", gap: 8 },
  yAxis: { justifyContent: "space-between", alignItems: "flex-end", width: 32, marginTop: -6, marginBottom: -6 },
  axisText: { fontSize: 11 },
  flex1: { flex: 1, minWidth: 0 },
  plot: { position: "relative" },
  gridLine: { position: "absolute", left: 0, right: 0, height: 1 },
  bars: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, flexDirection: "row", alignItems: "flex-end" },
  slot: { height: "100%", alignItems: "center", justifyContent: "flex-end" },
  // Rounded data end, square at the baseline.
  bar: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  tooltip: { position: "absolute", top: 4, width: 120, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 6, ...SHADOW.raised },
  tooltipDay: { fontSize: 11.5 },
  tooltipValue: { fontSize: 13.5, fontWeight: "700" },
  xAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  table: { borderWidth: 1, borderRadius: RADIUS.sm, maxHeight: CHART_HEIGHT + 24, overflow: "scroll" as never },
  tableRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1 },
  tableCell: { fontSize: 13 },
  noData: { fontSize: 13, paddingVertical: 16 },
  barList: { gap: 10 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  barLabel: { width: 120, fontSize: 13.5 },
  barTrack: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  // Rounded data end only; square where it starts.
  hBar: { height: 14, borderTopRightRadius: 4, borderBottomRightRadius: 4, minWidth: 3 },
  barValue: { fontSize: 12.5, fontWeight: "600" },
});
