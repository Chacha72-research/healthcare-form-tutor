// The big picture as a simple picture: You, the Clinic, and Insurance, with
// one arrow for each step. The current step's arrow is drawn in color and a
// little paper (like $ or BILL) travels along it. Earlier steps stay faint.

import { useLang } from "../i18n";
import type { Actor } from "../types";
import { Icon } from "./Icon";

export interface FlowStep {
  from: Actor;
  to: Actor;
  token: string;
}

const X: Record<Actor, number> = { you: 56, clinic: 180, insurance: 304 };
const COLORS = ["#2fb36d", "#14a3a3", "#3b82f6", "#8b5cf6", "#f08a24"];

function arcFor(from: Actor, to: Actor): string {
  const a = X[from];
  const b = X[to];
  const far = Math.abs(a - b) > 200;
  const forward = b > a;
  // Arrows going right ride above the three badges; arrows coming back ride below their names.
  const y = forward ? 88 : 196;
  const lift = forward ? (far ? -118 : -48) : far ? 78 : 40;
  const pad = far ? 22 : 36;
  const x1 = a + (forward ? pad : -pad);
  const x2 = b + (forward ? -pad : pad);
  return `M ${x1} ${y} Q ${(x1 + x2) / 2} ${y + lift} ${x2} ${y}`;
}

export function FlowDiagram({ steps, current, showAll = false }: { steps: FlowStep[]; current: number; showAll?: boolean }) {
  const { t, en } = useLang();
  const active = showAll ? -1 : current;
  const actors: Actor[] = ["you", "clinic", "insurance"];
  const icon: Record<Actor, string> = { you: "home", clinic: "desk", insurance: "card" };
  const busy = active >= 0 ? new Set([steps[active].from, steps[active].to]) : new Set<Actor>();

  return (
    <div className="flow">
      <svg className="flow-svg" viewBox="0 0 360 280" aria-hidden="true">
        <defs>
          {COLORS.map((c, i) => (
            <marker key={i} id={`head-${i}`} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill={c} />
            </marker>
          ))}
          <marker id="head-faint" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="#b9c7c3" />
          </marker>
        </defs>
        {steps.map((s, i) => {
          if (!showAll && i > current) return null;
          const on = showAll || i === current;
          const d = arcFor(s.from, s.to);
          return (
            <g key={i} className={on ? "flow-arrow is-on" : "flow-arrow"}>
              <path
                id={`flow-${i}`}
                d={d}
                fill="none"
                stroke={on ? COLORS[i % COLORS.length] : "#c9d5d1"}
                strokeWidth={on ? 4.5 : 3}
                strokeLinecap="round"
                strokeDasharray={on ? "9 7" : undefined}
                markerEnd={`url(#${on ? `head-${i % COLORS.length}` : "head-faint"})`}
              />
              {i === active && (
                <g className="flow-token">
                  <rect x={-24} y={-13} width={48} height={26} rx={8} fill="#fff" stroke={COLORS[i % COLORS.length]} strokeWidth={2.5} />
                  <text x={0} y={5} textAnchor="middle" fontSize={s.token.length > 3 ? 11 : 14} fontWeight={800} fill="#16232a">
                    {s.token}
                  </text>
                  <animateMotion dur="2.2s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
                    <mpath href={`#flow-${i}`} />
                  </animateMotion>
                </g>
              )}
              {showAll && (
                <PathNumber d={d} n={i + 1} color={COLORS[i % COLORS.length]} />
              )}
            </g>
          );
        })}
      </svg>
      {actors.map((a) => (
        <div key={a} className={`flow-actor flow-${a}${busy.has(a) ? " is-busy" : ""}`}>
          <span className="flow-badge">
            <Icon name={icon[a]} size={30} />
          </span>
          <span className="flow-name" lang="en">
            {en(`bp_${a}`)}
          </span>
          <span className="flow-l1">{t(`bp_${a}`)}</span>
        </div>
      ))}
    </div>
  );
}

function PathNumber({ d, n, color }: { d: string; n: number; color: string }) {
  // Put the step number on the middle of the curve (the quadratic's midpoint).
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const [x1, y1, cx, cy, x2, y2] = nums;
  const mx = 0.25 * x1 + 0.5 * cx + 0.25 * x2;
  const my = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
  return (
    <g>
      <circle cx={mx} cy={my} r={12} fill={color} />
      <text x={mx} y={my + 5} textAnchor="middle" fontSize={14} fontWeight={800} fill="#fff">
        {n}
      </text>
    </g>
  );
}
