import { useState, useEffect, useRef } from 'react';
import { supabase, looks as looksApi, garments as garmentsApi, LookType, GarmentType } from '../lib/supabase';
import { removeBackgroundFromImage, getGarmentTransform, calculateGarmentDimensions } from '../lib/imageProcessing';

// ─── Global CSS ─────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Jost', sans-serif; background: #F6F1EA; }
  input, textarea, button { font-family: 'Jost', sans-serif; }
  button { cursor: pointer; border: none; background: none; }
  input:focus, textarea:focus { outline: none; }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(24px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateX(20px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  .fadeIn { animation: fadeIn 0.45s cubic-bezier(.16,1,.3,1) both; }
  .slideUp { animation: slideUp 0.5s cubic-bezier(.16,1,.3,1) both; }

  .zone-btn:hover { background: rgba(255,255,255,0.55) !important; }
  .look-card:hover .card-overlay { opacity: 1 !important; }
  .look-card:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,0.1) !important; }
  .look-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
  .pill-btn:hover { background: #1A1510 !important; color: #F6F1EA !important; }
  .ghost-btn:hover { background: #F0E9DE !important; }
  .remove-btn { opacity: 0; transition: opacity 0.2s; }
  .garment-row:hover .remove-btn { opacity: 1; }
  .skin-dot:hover { transform: scale(1.15); }
  .skin-dot { transition: transform 0.2s; }
  .garment-img { transition: all 0.3s ease-out; }
`;

// ─── Constants ─────────────────────────────────────────────────────────────
const C = {
  bg: '#F6F1EA',
  white: '#FFFFFF',
  border: '#DDD2BE',
  text: '#171310',
  muted: '#8A7F70',
  gold: '#9E7B34',
  nude: '#E8DECE',
  danger: '#8B2E2E',
  surface: '#FDFAF5',
};

const SKINS = [
  { id: 'porcelain', label: 'Porcelain', hex: '#FDDBB4' },
  { id: 'ivory', label: 'Ivory', hex: '#EDB98A' },
  { id: 'beige', label: 'Beige', hex: '#D08B5B' },
  { id: 'almond', label: 'Almond', hex: '#AE5D29' },
  { id: 'espresso', label: 'Espresso', hex: '#7D4E35' },
  { id: 'ebony', label: 'Ebony', hex: '#3D1C10' },
];

const BODIES = [
  { id: 'slim', label: 'Slim' },
  { id: 'standard', label: 'Padrão' },
  { id: 'athletic', label: 'Atlético' },
  { id: 'curvy', label: 'Curvilíneo' },
];

const CATS = [
  { id: 'top', label: 'Top', hint: 'Blusa, camiseta, casaco…' },
  { id: 'bottom', label: 'Bottom', hint: 'Calça, saia, shorts…' },
  { id: 'shoes', label: 'Calçados', hint: 'Sapato, tênis, sandália…' },
  { id: 'accessory', label: 'Acessório', hint: 'Bolsa, chapéu, cinto…' },
];

const ZONES = {
  top: { top: '13%', left: '14%', width: '72%', height: '31%' },
  bottom: { top: '44%', left: '17%', width: '66%', height: '34%' },
  shoes: { top: '78%', left: '14%', width: '72%', height: '20%' },
};

// ─── Utilities ─────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);

const darkenHex = (hex: string, amt: number) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (n >> 16) - amt);
  const g = Math.max(0, ((n >> 8) & 0xff) - amt);
  const b = Math.max(0, (n & 0xff) - amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

interface MannequinConfig {
  skinTone: string;
  bodyType: string;
}

interface GarmentData {
  id: string;
  name: string;
  imageUrl: string;
  shopUrl: string;
  category: string;
  cleanImageUrl?: string;
  width?: number;
  height?: number;
}

interface LookData {
  id: string;
  name: string;
  mannequin: MannequinConfig;
  garments: Record<string, GarmentData>;
  updatedAt: string;
  createdAt: string;
}

// ─── Mannequin SVG ────────────────────────────────────────────────────────
function Mannequin({ skinHex = '#FDDBB4', bodyId = 'standard' }) {
  const shade = darkenHex(skinHex, 25);
  const deep = darkenHex(skinHex, 45);

  const torsoW = bodyId === 'slim' ? 0.87 : bodyId === 'curvy' ? 1.05 : bodyId === 'athletic' ? 1.03 : 1;
  const hipW = bodyId === 'slim' ? 0.83 : bodyId === 'curvy' ? 1.22 : bodyId === 'athletic' ? 0.98 : 1;

  const tx = (w: number) => `matrix(${w},0,0,1,${100 * (1 - w)},0)`;

  return (
    <svg viewBox="0 0 200 500" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', display: 'block' }}>
      <ellipse cx="100" cy="493" rx="44" ry="5" fill="rgba(0,0,0,0.07)" />
      <ellipse cx="100" cy="20" rx="21" ry="17" fill="#211508" />
      <path d="M79,28 Q73,56 78,72" stroke="#211508" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M121,28 Q127,56 122,72" stroke="#211508" strokeWidth="7" fill="none" strokeLinecap="round" />
      <ellipse cx="100" cy="35" rx="20" ry="24" fill={skinHex} />
      <ellipse cx="93" cy="32" rx="2.5" ry="2" fill={deep} opacity="0.55" />
      <ellipse cx="107" cy="32" rx="2.5" ry="2" fill={deep} opacity="0.55" />
      <path d="M100,36 Q98,40 100,42 Q102,40 100,36" fill={shade} opacity="0.3" />
      <path d="M95,45 Q100,48.5 105,45" stroke={deep} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.5" />
      <path d="M92,57 L92,75 Q100,80 108,75 L108,57Z" fill={skinHex} />
      <g transform={tx(torsoW)}>
        <path d="M62,73 Q37,83 35,114 L35,186 Q35,198 50,200 L150,200 Q165,198 165,186 L165,114 Q163,83 138,73 Q120,68 100,68 Q80,68 62,73Z" fill={skinHex} />
        <path d="M40,175 Q42,190 50,200" stroke={shade} strokeWidth="1" fill="none" opacity="0.25" />
        <path d="M160,175 Q158,190 150,200" stroke={shade} strokeWidth="1" fill="none" opacity="0.25" />
        <path d="M35,114 Q18,130 13,163 Q8,195 17,218 Q24,227 32,222 Q34,196 38,163 L35,114Z" fill={skinHex} />
        <ellipse cx="20" cy="226" rx="9" ry="6" fill={shade} />
        <path d="M165,114 Q182,130 187,163 Q192,195 183,218 Q176,227 168,222 Q166,196 162,163 L165,114Z" fill={skinHex} />
        <ellipse cx="180" cy="226" rx="9" ry="6" fill={shade} />
      </g>
      <g transform={tx(hipW)}>
        <path d="M50,200 Q39,222 41,246 Q43,267 56,274 L144,274 Q157,267 159,246 Q161,222 150,200Z" fill={skinHex} />
        <path d="M100,200 L100,274" stroke={shade} strokeWidth="0.8" fill="none" opacity="0.18" />
        <path d="M56,274 Q46,308 46,357 Q46,408 49,450 Q51,460 64,460 Q75,460 77,450 Q80,408 79,357 Q78,308 73,274Z" fill={skinHex} />
        <path d="M144,274 Q154,308 154,357 Q154,408 151,450 Q149,460 136,460 Q125,460 123,450 Q120,408 121,357 Q122,308 127,274Z" fill={skinHex} />
        <ellipse cx="62" cy="462" rx="18" ry="8" fill={shade} />
        <ellipse cx="138" cy="462" rx="18" ry="8" fill={shade} />
      </g>
      <g transform={tx(torsoW)} opacity="0.12">
        <path d="M94,73 Q88,130 90,195" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// ─── Mannequin Canvas with Smart Garment Positioning ─────────────────────────
function MannequinCanvas({ mannequin, garments, onZoneClick, onGarmentClick }: any) {
  const skinHex = SKINS.find((s) => s.id === mannequin.skinTone)?.hex || '#FDDBB4';
  const canvasRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 280, height: 500 });

  useEffect(() => {
    if (canvasRef.current) {
      setContainerSize({
        width: canvasRef.current.offsetWidth,
        height: canvasRef.current.offsetHeight,
      });
    }
  }, []);

  const renderGarment = (cat: string, g: GarmentData) => {
    const zone = ZONES[cat as keyof typeof ZONES];
    const zoneElement = canvasRef.current?.querySelector(`[data-zone="${cat}"]`);
    if (!zoneElement) return null;

    const zoneRect = zoneElement.getBoundingClientRect();
    const containerRect = canvasRef.current?.getBoundingClientRect();
    if (!containerRect) return null;

    const zoneWidth = zoneRect.width;
    const zoneHeight = zoneRect.height;

    const transform = getGarmentTransform(cat, mannequin.bodyType, zoneWidth, zoneHeight);
    const dims = calculateGarmentDimensions(
      g.width || 200,
      g.height || 200,
      zoneWidth,
      zoneHeight,
      transform.scale,
      transform.offsetY,
      transform.offsetX
    );

    return (
      <div
        key={`${cat}-garment`}
        style={{
          position: 'absolute',
          left: `${zone.left}`,
          top: `${zone.top}`,
          width: zone.width,
          height: zone.height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          overflow: 'hidden',
        }}
        onClick={() => onGarmentClick(g)}
        title={`${g.name} - Clique para acessar`}
      >
        <img
          src={g.cleanImageUrl || g.imageUrl}
          alt={g.name}
          className="garment-img"
          style={{
            width: `${dims.width}px`,
            height: `${dims.height}px`,
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.18))',
            transform: `translate(calc(-50% + ${dims.x}px), calc(-50% + ${dims.y}px))`,
            position: 'absolute',
            left: '50%',
            top: '50%',
          }}
        />
      </div>
    );
  };

  return (
    <div ref={canvasRef} style={{ position: 'relative', width: '100%', userSelect: 'none' }}>
      <Mannequin skinHex={skinHex} bodyId={mannequin.bodyType} />

      {CATS.filter((c) => c.id !== 'accessory').map((cat) => {
        const zone = ZONES[cat.id as keyof typeof ZONES];
        const g = garments[cat.id];
        return (
          <div
            key={cat.id}
            data-zone={cat.id}
            style={{
              position: 'absolute',
              ...zone,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {g ? (
              renderGarment(cat.id, g)
            ) : (
              <button
                className="zone-btn"
                onClick={() => onZoneClick(cat.id)}
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'rgba(255,255,255,0.2)',
                  border: '1px dashed rgba(180,165,140,0.5)',
                  borderRadius: 4,
                  color: C.muted,
                  fontSize: 11,
                  fontFamily: "'Jost',sans-serif",
                  fontWeight: 300,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  transition: 'background 0.2s',
                }}
              >
                + {cat.label}
              </button>
            )}
          </div>
        );
      })}

      <div style={{ position: 'absolute', top: '26%', right: '-22%', width: '30%', height: '28%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {garments.accessory ? (
          <div
            style={{ position: 'relative', width: '100%', height: '100%', cursor: 'pointer' }}
            onClick={() => onGarmentClick(garments.accessory)}
            title={`${garments.accessory.name} - Clique para acessar`}
          >
            <img
              src={garments.accessory.cleanImageUrl || garments.accessory.imageUrl}
              alt={garments.accessory.name}
              className="garment-img"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                filter: 'drop-shadow(0 3px 10px rgba(0,0,0,0.16))',
              }}
            />
          </div>
        ) : (
          <button
            className="zone-btn"
            onClick={() => onZoneClick('accessory')}
            style={{
              width: '100%',
              height: '100%',
              background: 'rgba(255,255,255,0.2)',
              border: '1px dashed rgba(180,165,140,0.5)',
              borderRadius: 4,
              color: C.muted,
              fontSize: 10,
              fontFamily: "'Jost',sans-serif",
              fontWeight: 300,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              transition: 'background 0.2s',
            }}
          >
            + Acessório
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Home Screen ────────────────────────────────────────────────────────────
function HomeScreen({ looks, onNew, onOpen, onDelete }: any) {
  return (
    <div className="fadeIn" style={{ minHeight: '100vh', background: C.bg }}>
      <header style={{ borderBottom: `1px solid ${C.border}`, padding: '24px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.surface }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, fontWeight: 300, letterSpacing: '0.2em', color: C.text }}>RHAPSO</div>
          <div style={{ fontSize: 10, fontWeight: 300, letterSpacing: '0.25em', color: C.muted, textTransform: 'uppercase', marginTop: 2 }}>Virtual Wardrobe</div>
        </div>
        <button className="pill-btn" onClick={onNew} style={{ padding: '10px 28px', background: C.text, color: C.white, fontSize: 11, fontWeight: 400, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          + Novo Look
        </button>
      </header>
      <main style={{ padding: '56px 48px' }}>
        {looks.length === 0 ? (
          <EmptyState onNew={onNew} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 40 }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 400, letterSpacing: '0.04em', color: C.text }}>Seus Looks</h2>
              <span style={{ fontSize: 12, color: C.muted, fontWeight: 300, letterSpacing: '0.1em' }}>— {looks.length} {looks.length === 1 ? 'criação' : 'criações'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 24 }}>
              {looks.map((look: LookData, i: number) => (
                <LookCard key={look.id} look={look} delay={i * 60} onOpen={() => onOpen(look)} onDelete={() => onDelete(look.id)} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function EmptyState({ onNew }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80, textAlign: 'center' }}>
      <div style={{ width: 80, marginBottom: 32, opacity: 0.18 }}>
        <Mannequin skinHex="#888" bodyId="standard" />
      </div>
      <h3 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, fontWeight: 300, color: C.text, letterSpacing: '0.06em' }}>Seu guarda-roupa está vazio</h3>
      <p style={{ fontSize: 13, color: C.muted, fontWeight: 300, marginTop: 12, letterSpacing: '0.05em', lineHeight: 1.7 }}>
        Crie seu primeiro look e comece a montar<br />combinações únicas com seu manequim virtual.
      </p>
      <button className="pill-btn" onClick={onNew} style={{ marginTop: 36, padding: '12px 36px', background: C.text, color: C.white, fontSize: 11, fontWeight: 400, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
        Criar Primeiro Look
      </button>
    </div>
  );
}

function LookCard({ look, onOpen, onDelete, delay }: any) {
  const skinHex = SKINS.find((s) => s.id === look.mannequin?.skinTone)?.hex || '#FDDBB4';
  const garmentCount = Object.keys(look.garments || {}).length;

  return (
    <div className="look-card fadeIn" style={{ background: C.surface, border: `1px solid ${C.border}`, overflow: 'hidden', position: 'relative', animationDelay: `${delay}ms`, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
      <div style={{ padding: '24px 32px 12px', background: C.nude + '44', position: 'relative' }}>
        <div style={{ width: 90, margin: '0 auto' }}>
          <Mannequin skinHex={skinHex} bodyId={look.mannequin?.bodyType || 'standard'} />
        </div>
        <div className="card-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(23,19,16,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, opacity: 0, transition: 'opacity 0.3s ease' }}>
          <button onClick={onOpen} style={{ padding: '9px 22px', background: C.white, color: C.text, fontSize: 10, fontWeight: 400, letterSpacing: '0.15em', textTransform: 'uppercase', borderRadius: 4 }}>
            Editar
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Excluir este look?')) onDelete();
            }}
            style={{ padding: '9px 22px', background: 'transparent', color: '#FFB4B4', fontSize: 10, fontWeight: 400, letterSpacing: '0.15em', textTransform: 'uppercase', border: '1px solid rgba(255,180,180,0.4)', borderRadius: 4 }}
          >
            Excluir
          </button>
        </div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 17, fontWeight: 400, color: C.text, letterSpacing: '0.03em', marginBottom: 4 }}>{look.name}</div>
        <div style={{ fontSize: 10, color: C.muted, fontWeight: 300, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {garmentCount} {garmentCount === 1 ? 'peça' : 'peças'} · {new Date(look.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
        </div>
      </div>
    </div>
  );
}

// ─── Editor Screen ────────────────────────────────────────────────────────────
function EditorScreen({ lookName, onNameChange, mannequin, garments, onBack, onSave, onShare, onConfigMannequin, onAddGarment, onRemoveGarment, onGarmentClick }: any) {
  const [editingName, setEditingName] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) nameRef.current?.focus();
  }, [editingName]);

  return (
    <div className="fadeIn" style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column' }}>
      <header style={{ borderBottom: `1px solid ${C.border}`, padding: '0 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.surface, height: 64 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <button onClick={onBack} style={{ fontSize: 11, color: C.muted, fontWeight: 300, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Voltar
          </button>
          <div style={{ width: 1, height: 20, background: C.border }} />
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 300, letterSpacing: '0.15em', color: C.text }}>RHAPSO</div>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          {editingName ? (
            <input
              ref={nameRef}
              value={lookName}
              onChange={(e) => onNameChange(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
              style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 400, letterSpacing: '0.06em', color: C.text, background: 'transparent', border: 'none', borderBottom: `1px solid ${C.border}`, width: 300, textAlign: 'center' }}
            />
          ) : (
            <button onClick={() => setEditingName(true)} style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 400, letterSpacing: '0.06em', color: C.text, display: 'flex', gap: 8, alignItems: 'center' }}>
              {lookName}
              <span style={{ fontSize: 9, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'Jost',sans-serif", fontWeight: 300 }}>editar</span>
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="ghost-btn pill-btn" onClick={onShare} style={{ padding: '8px 20px', border: `1px solid ${C.border}`, fontSize: 10, fontWeight: 400, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.text }}>
            Compartilhar
          </button>
          <button className="pill-btn" onClick={onSave} style={{ padding: '8px 24px', background: C.text, color: C.white, fontSize: 10, fontWeight: 400, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Salvar Look
          </button>
        </div>
      </header>
      <div style={{ flex: 1, display: 'flex', gap: 0 }}>
        <aside style={{ width: 200, borderRight: `1px solid ${C.border}`, padding: '36px 28px', background: C.surface, display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div>
            <SectionLabel>Tom de pele</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              {SKINS.map((s) => (
                <button
                  key={s.id}
                  className="skin-dot"
                  onClick={() => onConfigMannequin({ skinTone: s.id })}
                  title={s.label}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: s.hex,
                    border: mannequin.skinTone === s.id ? `2px solid ${C.text}` : '2px solid transparent',
                    boxShadow: mannequin.skinTone === s.id ? `0 0 0 1px ${C.text}` : 'none',
                    transition: 'transform 0.2s',
                  }}
                />
              ))}
            </div>
          </div>
          <div>
            <SectionLabel>Tipo de corpo</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
              {BODIES.map((b) => (
                <button
                  key={b.id}
                  onClick={() => onConfigMannequin({ bodyType: b.id })}
                  style={{
                    padding: '7px 14px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: mannequin.bodyType === b.id ? 500 : 300,
                    letterSpacing: '0.06em',
                    color: mannequin.bodyType === b.id ? C.text : C.muted,
                    background: mannequin.bodyType === b.id ? C.nude + '88' : 'transparent',
                    border: `1px solid ${mannequin.bodyType === b.id ? C.border : 'transparent'}`,
                    transition: 'all 0.2s',
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </aside>
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 80px' }}>
          <div style={{ width: '100%', maxWidth: 280, position: 'relative' }}>
            <MannequinCanvas mannequin={mannequin} garments={garments} onZoneClick={onAddGarment} onGarmentClick={(g: GarmentData) => { if (g.shopUrl) window.open(g.shopUrl, '_blank'); }} />
          </div>
        </main>
        <aside style={{ width: 260, borderLeft: `1px solid ${C.border}`, padding: '36px 28px', background: C.surface, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SectionLabel style={{ marginBottom: 18 }}>Peças do Look</SectionLabel>
          {CATS.map((cat) => {
            const g = garments[cat.id];
            return (
              <div key={cat.id} className="garment-row" style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 16, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: g ? 10 : 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 400, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted }}>{cat.label}</span>
                  {!g ? (
                    <button onClick={() => onAddGarment(cat.id)} style={{ fontSize: 18, color: C.muted, lineHeight: 1, transition: 'color 0.2s' }} title={`Adicionar ${cat.label}`}>
                      +
                    </button>
                  ) : (
                    <button className="remove-btn" onClick={() => onRemoveGarment(cat.id)} style={{ fontSize: 9, color: C.danger, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>
                      Remover
                    </button>
                  )}
                </div>
                {g && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 48, height: 48, flexShrink: 0, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <img src={g.cleanImageUrl || g.imageUrl} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 400, color: C.text, letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                      {g.shopUrl && (
                        <a href={g.shopUrl} target="_blank" rel="noreferrer" style={{ fontSize: 9, color: C.gold, fontWeight: 400, letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none' }}>
                          Ver na loja ↗
                        </a>
                      )}
                    </div>
                  </div>
                )}
                {!g && (
                  <div style={{ fontSize: 10, color: C.border, fontWeight: 300, letterSpacing: '0.06em', fontStyle: 'italic' }}>{cat.hint}</div>
                )}
              </div>
            );
          })}
          <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 9, color: C.muted, fontWeight: 300, letterSpacing: '0.08em', lineHeight: 1.8, textTransform: 'uppercase' }}>Clique em uma peça no manequim para acessar o link da loja</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Add Garment Modal ────────────────────────────────────────────────────────
function AddGarmentModal({ category, onAdd, onClose }: any) {
  const cat = CATS.find((c) => c.id === category);
  const [mode, setMode] = useState<'url' | 'file'>('url');
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [shopUrl, setShopUrl] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setImageUrl(result);
      setPreview(result);
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleUrlChange = (url: string) => {
    setImageUrl(url);
    setPreview(url || null);
  };

  const handleSubmit = async () => {
    if (!imageUrl) return;
    setProcessing(true);
    try {
      const cleanImageUrl = await removeBackgroundFromImage(imageUrl);
      const img = new Image();
      img.onload = () => {
        onAdd({
          id: uid(),
          name: name || cat?.label,
          imageUrl,
          cleanImageUrl,
          shopUrl,
          category,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
        setProcessing(false);
      };
      img.onerror = () => {
        onAdd({
          id: uid(),
          name: name || cat?.label,
          imageUrl,
          cleanImageUrl,
          shopUrl,
          category,
          width: 200,
          height: 200,
        });
        setProcessing(false);
      };
      img.src = cleanImageUrl;
    } catch (error) {
      console.error('Error processing image:', error);
      setProcessing(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="slideUp" style={{ background: C.white, width: '100%', maxWidth: 460, padding: '40px 44px' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 9, color: C.muted, fontWeight: 300, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 6 }}>Adicionar peça</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 400, color: C.text, letterSpacing: '0.04em' }}>{cat?.label}</h2>
        </div>
        <div style={{ display: 'flex', gap: 0, marginBottom: 24, border: `1px solid ${C.border}` }}>
          {(['url', 'file'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: '9px',
                fontSize: 10,
                fontWeight: 400,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                background: mode === m ? C.text : 'transparent',
                color: mode === m ? C.white : C.muted,
                transition: 'all 0.2s',
              }}
            >
              {m === 'url' ? 'URL da imagem' : 'Upload de arquivo'}
            </button>
          ))}
        </div>
        {mode === 'url' ? (
          <FieldGroup label="URL da imagem">
            <TextInput placeholder="https://exemplo.com/imagem.png" value={imageUrl} onChange={(v) => handleUrlChange(v)} />
          </FieldGroup>
        ) : (
          <FieldGroup label="Arquivo de imagem">
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px dashed ${C.border}`,
                padding: '20px',
                cursor: 'pointer',
                fontSize: 11,
                color: C.muted,
                letterSpacing: '0.08em',
                fontWeight: 300,
                transition: 'background 0.2s',
              }}
            >
              {loading ? 'Carregando…' : preview ? 'Clique para trocar' : 'Clique para selecionar'}
              <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
            </label>
          </FieldGroup>
        )}
        {preview && (
          <div style={{ margin: '16px 0', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.border}`, background: C.bg }}>
            <img src={preview} alt="preview" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} onError={() => setPreview(null)} />
          </div>
        )}
        <FieldGroup label="Nome da peça (opcional)">
          <TextInput placeholder={cat?.hint} value={name} onChange={setName} />
        </FieldGroup>
        <FieldGroup label="Link da loja (opcional)">
          <TextInput placeholder="https://loja.com/produto" value={shopUrl} onChange={setShopUrl} />
        </FieldGroup>
        <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px', border: `1px solid ${C.border}`, fontSize: 10, fontWeight: 400, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text }}>
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!imageUrl || processing}
            style={{
              flex: 2,
              padding: '12px',
              background: imageUrl && !processing ? C.text : C.border,
              color: C.white,
              fontSize: 10,
              fontWeight: 400,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: imageUrl && !processing ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s',
            }}
          >
            {processing ? 'Processando…' : 'Adicionar ao Look'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────
function Toast({ message, onDone }: any) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 36,
        right: 36,
        zIndex: 9999,
        background: C.text,
        color: C.white,
        padding: '13px 24px',
        fontSize: 11,
        fontWeight: 400,
        letterSpacing: '0.1em',
        boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
        animation: 'toastIn 0.3s cubic-bezier(.16,1,.3,1) both',
      }}
    >
      {message}
    </div>
  );
}

// ─── Shared Components ─────────────────────────────────────────────────────
function Overlay({ children, onClose }: any) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(23,19,16,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
        backdropFilter: 'blur(3px)',
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function SectionLabel({ children, style }: any) {
  return (
    <div style={{ fontSize: 9, fontWeight: 400, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.muted, ...style }}>
      {children}
    </div>
  );
}

function FieldGroup({ label, children }: any) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 9, fontWeight: 400, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({ placeholder, value, onChange }: any) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '11px 14px',
        border: `1px solid ${C.border}`,
        background: C.bg,
        fontSize: 12,
        fontWeight: 300,
        color: C.text,
        letterSpacing: '0.03em',
      }}
    />
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────
export default function Rhapso() {
  const [screen, setScreen] = useState<'home' | 'editor'>('home');
  const [looks, setLooks] = useState<LookData[]>([]);
  const [editingLook, setEditingLook] = useState<LookData | null>(null);
  const [lookName, setLookName] = useState('Meu Look');
  const [mannequin, setMannequin] = useState<MannequinConfig>({ skinTone: 'ivory', bodyType: 'standard' });
  const [garments, setGarments] = useState<Record<string, GarmentData>>({});
  const [modal, setModal] = useState<'addGarment' | null>(null);
  const [addingCat, setAddingCat] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadLooks = async () => {
      try {
        const data = await looksApi.getAll();
        const lookDataWithGarments = await Promise.all(
          data.map(async (look: LookType) => {
            const garmentsData = await garmentsApi.getByLookId(look.id);
            const garmentsRecord: Record<string, GarmentData> = {};
            garmentsData.forEach((g: GarmentType) => {
              garmentsRecord[g.category] = {
                id: g.id,
                name: g.name,
                imageUrl: g.image_url,
                shopUrl: g.shop_url || '',
                category: g.category,
              };
            });
            return {
              id: look.id,
              name: look.name,
              mannequin: { skinTone: look.skin_tone, bodyType: look.body_type },
              garments: garmentsRecord,
              updatedAt: look.updated_at,
              createdAt: look.created_at,
            };
          })
        );
        setLooks(lookDataWithGarments);
      } catch (error) {
        console.error('Erro ao carregar looks:', error);
      } finally {
        setLoading(false);
      }
    };

    loadLooks();
  }, []);

  const showToast = (msg: string) => setToast(msg);

  const newLook = () => {
    setEditingLook(null);
    setLookName('Meu Look');
    setMannequin({ skinTone: 'ivory', bodyType: 'standard' });
    setGarments({});
    setScreen('editor');
  };

  const openLook = (look: LookData) => {
    setEditingLook(look);
    setLookName(look.name);
    setMannequin(look.mannequin);
    setGarments(look.garments);
    setScreen('editor');
  };

  const saveLook = async () => {
    try {
      if (editingLook) {
        await looksApi.update(editingLook.id, { name: lookName, skin_tone: mannequin.skinTone, body_type: mannequin.bodyType });

        for (const [category, garment] of Object.entries(garments)) {
          const existing = editingLook.garments[category];
          if (existing && existing.id !== garment.id) {
            await garmentsApi.delete(existing.id);
            await garmentsApi.create({ look_id: editingLook.id, category, name: garment.name, image_url: garment.imageUrl, shop_url: garment.shopUrl || null });
          } else if (!existing) {
            await garmentsApi.create({ look_id: editingLook.id, category, name: garment.name, image_url: garment.imageUrl, shop_url: garment.shopUrl || null });
          }
        }

        for (const category of Object.keys(editingLook.garments)) {
          if (!garments[category]) {
            await garmentsApi.delete(editingLook.garments[category].id);
          }
        }
      } else {
        const newLook = await looksApi.create({ name: lookName, skin_tone: mannequin.skinTone, body_type: mannequin.bodyType });

        for (const [category, garment] of Object.entries(garments)) {
          await garmentsApi.create({ look_id: newLook.id, category, name: garment.name, image_url: garment.imageUrl, shop_url: garment.shopUrl || null });
        }

        setEditingLook({ ...newLook, mannequin, garments, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() });
      }

      const updatedLooks = await looksApi.getAll();
      const lookDataWithGarments = await Promise.all(
        updatedLooks.map(async (look: LookType) => {
          const garmentsData = await garmentsApi.getByLookId(look.id);
          const garmentsRecord: Record<string, GarmentData> = {};
          garmentsData.forEach((g: GarmentType) => {
            garmentsRecord[g.category] = {
              id: g.id,
              name: g.name,
              imageUrl: g.image_url,
              shopUrl: g.shop_url || '',
              category: g.category,
            };
          });
          return {
            id: look.id,
            name: look.name,
            mannequin: { skinTone: look.skin_tone, bodyType: look.body_type },
            garments: garmentsRecord,
            updatedAt: look.updated_at,
            createdAt: look.created_at,
          };
        })
      );
      setLooks(lookDataWithGarments);
      showToast('Look salvo com sucesso');
    } catch (error) {
      console.error('Erro ao salvar look:', error);
      showToast('Erro ao salvar look');
    }
  };

  const deleteLook = async (id: string) => {
    try {
      await looksApi.delete(id);
      setLooks((prev) => prev.filter((l) => l.id !== id));
      showToast('Look excluído');
    } catch (error) {
      console.error('Erro ao excluir look:', error);
      showToast('Erro ao excluir look');
    }
  };

  const addGarment = (cat: string, data: GarmentData) => {
    setGarments((prev) => ({ ...prev, [cat]: data }));
    setModal(null);
    showToast('Peça adicionada');
  };

  const removeGarment = (cat: string) => {
    setGarments((prev) => {
      const n = { ...prev };
      delete n[cat];
      return n;
    });
  };

  const shareViaClipboard = () => {
    const text = `RHAPSO — ${lookName}\n\nTom: ${SKINS.find((s) => s.id === mannequin.skinTone)?.label}\nCorpo: ${BODIES.find((b) => b.id === mannequin.bodyType)?.label}\nPeças: ${Object.keys(garments).length}`;
    navigator.clipboard
      .writeText(text)
      .then(() => showToast('Copiado para a área de transferência'))
      .catch(() => showToast('Não foi possível copiar'));
  };

  const handleConfigMannequin = (partial: Partial<MannequinConfig>) => {
    setMannequin((prev) => ({ ...prev, ...partial }));
  };

  const openAddGarment = (cat: string) => {
    setAddingCat(cat);
    setModal('addGarment');
  };

  if (loading) {
    return <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Jost, sans-serif', color: C.muted }}>Carregando...</div>;
  }

  return (
    <div>
      <style>{GLOBAL_CSS}</style>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Jost:wght@200;300;400;500&display=swap');
          body { font-family: 'Jost', sans-serif; }
        `}
      </style>
      {screen === 'home' ? <HomeScreen looks={looks} onNew={newLook} onOpen={openLook} onDelete={deleteLook} /> : <EditorScreen lookName={lookName} onNameChange={setLookName} mannequin={mannequin} garments={garments} onBack={() => setScreen('home')} onSave={saveLook} onShare={shareViaClipboard} onConfigMannequin={handleConfigMannequin} onAddGarment={openAddGarment} onRemoveGarment={removeGarment} onGarmentClick={(g: GarmentData) => { if (g.shopUrl) window.open(g.shopUrl, '_blank'); }} />}
      {modal === 'addGarment' && <AddGarmentModal category={addingCat} onAdd={(data: GarmentData) => addGarment(addingCat || '', data)} onClose={() => setModal(null)} />}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
