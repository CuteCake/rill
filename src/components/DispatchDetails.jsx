import { dispatchInterface } from '../graph/dispatch.js';
import { colors as C, fonts } from '../utils/theme.js';

export default function DispatchDetails({ node, nodes, hiVals, onValClick }) {
  const { inputs, outputs } = dispatchInterface(nodes, node);
  const tag = (value, label) => <button onClick={(e) => { e.stopPropagation(); onValClick(value); }}
    style={{ background: hiVals.includes(value) ? '#245b80' : '#152638', color: '#7dd3fc', border: '1px solid #33546e', borderRadius: 4, fontFamily: fonts.mono, fontSize: 10, cursor: 'pointer' }}>{label}</button>;
  return <div style={{ padding: '8px 0', fontSize: 10, color: C.text, overflowWrap: 'anywhere' }} onClick={(e) => e.stopPropagation()}>
    <div style={{ color: '#7dd3fc', fontWeight: 600, marginBottom: 6 }}>Dispatch interface · {inputs.length} inputs · {outputs.length} {outputs.length === 1 ? 'result' : 'results'}</div>
    {inputs.map((input, i) => <div key={`in-${i}`} style={{ marginBottom: 6 }}>
      {tag(input.outerValue, input.rawOuter)} → <code>{input.argument || 'captured'}</code> <span style={{ color: C.dim }}>{input.access}</span>
      {input.type && <div style={{ color: C.green, marginTop: 2 }}>{input.type}</div>}
    </div>)}
    <div style={{ color: '#7dd3fc', borderTop: `1px solid ${C.border}`, paddingTop: 6, marginTop: 6 }}>Results</div>
    {outputs.map((output) => <div key={output.outerValue} style={{ marginTop: 6 }}>
      {tag(output.outerValue, output.rawOuter)} ← <code>{output.argument || 'return'}</code>
      {output.tiedTo && <span style={{ color: C.dim }}> · tied to {output.tiedTo}</span>}
      <div style={{ marginTop: 3 }}>Stored/returned: {output.values.length ? output.values.map((value, i) => <span key={value}>{i > 0 ? ', ' : ''}{tag(value, value.replace(/@\d+$/, ''))}</span>) : <span style={{ color: C.dim }}>no parsed write</span>}</div>
      {output.type && <div style={{ color: C.green, marginTop: 2 }}>{output.type}</div>}
    </div>)}
  </div>;
}
