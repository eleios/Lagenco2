/* ═══════════════════════════════════════════════════════
   LAGENCO — Weekelijks PDF Rapport (v1.0)
   Genereert een PDF met:
     - Branding (logo, bedrijfsnaam, periode)
     - Weekvergelijking (deze week vs vorige week)
     - KPI's van deze week
     - Top 3 bestverkochte producten
     - Voorraad-status
     - Agenda voor komende week
   Gebruikt jsPDF (CDN-loaded in business-panel.html).
   Wordt aangeroepen vanuit de dashboard "PDF-rapport" knop.
   ═══════════════════════════════════════════════════════ */
(function (window, document) {
  'use strict';

  // ────────────────────────────────────────────────────────
  // Configuratie — merk-kleuren als RGB-array voor jsPDF
  // ────────────────────────────────────────────────────────
  const COLORS = {
    primary:    [107, 191, 126],   // #6BBF7E
    primary2:   [74, 157, 94],     // #4A9D5E
    sidebarBg:  [45, 58, 46],      // #2D3A2E
    text:       [45, 58, 46],      // #2D3A2E
    textMuted:  [107, 122, 108],   // #6B7A6C
    textFaint:  [165, 181, 167],   // #A5B5A7
    bg:         [255, 248, 240],   // #FFF8F0
    card2:      [255, 244, 232],   // #FFF4E8
    border:     [255, 224, 204],   // #FFE0CC
    success:    [74, 157, 94],     // #4A9D5E
    successSoft:[213, 237, 218],   // #D5EDDA
    danger:     [224, 96, 85],     // #E06055
    dangerSoft: [255, 224, 220],   // #FFE0DC
    warn:       [212, 162, 78],    // #D4A24E
    warnSoft:   [255, 243, 204],   // #FFF3CC
    info:       [91, 168, 201],    // #5BA8C9
    infoSoft:   [216, 238, 246],   // #D8EEF6
    lavender:   [159, 138, 201],   // #9F8AC9
    lavenderSoft:[232, 222, 248],  // #E8DEF8
    white:      [255, 255, 255],
    black:      [0, 0, 0]
  };

  // ────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────
  const D = () => window.BPData;

  function fmtEuro(v) { return D().fmtEuro(v); }
  function fmtNum(v) { return D().fmtNum(v); }

  function fmtDateNL(dateStr) {
    if (!dateStr) return '';
    const d = D().parseDate(dateStr);
    if (!d) return dateStr;
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function fmtDateShortNL(dateStr) {
    if (!dateStr) return '';
    const d = D().parseDate(dateStr);
    if (!d) return dateStr;
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  }

  /** Bepaal of een delta "goed" (positive) of "slecht" (negative) is. */
  function deltaIsPositive(delta, inverted) {
    if (delta.abs === 0) return null; // neutral
    return inverted ? delta.abs < 0 : delta.abs > 0;
  }

  /** Format delta als string "+€X · +Y.Y%" of "-X · -Y.Y%". */
  function fmtDelta(delta, opts) {
    opts = opts || {};
    const sign = delta.abs >= 0 ? '+' : '−';
    const absStr = opts.money
      ? '€ ' + Math.abs(delta.abs).toFixed(2).replace('.', ',')
      : String(Math.abs(delta.abs));
    const pctStr = (delta.pct >= 0 ? '+' : '') + delta.pct.toFixed(1) + '%';
    return sign + absStr + '  (' + sign + pctStr.replace('+', '+').replace('-', '−') + ')';
  }

  // ────────────────────────────────────────────────────────
  // PDF-opbouw
  // ────────────────────────────────────────────────────────

  /**
   * Genereer het weekrapport als PDF en download het direct.
   * @param {Object} [opts] - { fileName: 'lagenco-weekrapport-YYYY-MM-DD.pdf' }
   */
  function generateWeeklyReport(opts) {
    opts = opts || {};
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
      console.error('[Report] jsPDF niet geladen');
      if (window.toast) window.toast('Fout', 'PDF-bibliotheek niet geladen. Vernieuw de pagina.', 'error');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();    // 210
    const pageH = doc.internal.pageSize.getHeight();   // 297
    const margin = 18;
    const contentW = pageW - margin * 2;

    // ── Data verzamelen ──
    const week = D().weeklyComparison();
    const stats = D().dashboardStats();
    const upcoming = D().upcomingAgenda(7);
    const user = (window.__bpAuth && typeof window.__bpAuth.getUser === 'function')
      ? (window.__bpAuth.getUser() || {})
      : {};
    const meta = D().list('meta') || {};
    const metaObj = Array.isArray(meta) && meta.length ? meta[0] : (meta || {});
    const companyName = metaObj.companyName || 'Lagenco';
    const owner = metaObj.owner || 'Bart van Lagen';

    let y = margin;

    // ═══════════════════════════════════════════════════════
    // KOP / HEADER
    // ═══════════════════════════════════════════════════════
    // Groene banner
    doc.setFillColor(...COLORS.sidebarBg);
    doc.rect(0, 0, pageW, 36, 'F');
    // Logo-blok (groen gradient-achtig)
    doc.setFillColor(...COLORS.primary);
    doc.roundedRect(margin, 8, 18, 18, 3, 3, 'F');
    doc.setTextColor(...COLORS.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('L', margin + 9, 19.5, { align: 'center' });

    // Titel
    doc.setFontSize(20);
    doc.text(companyName + ' — Weekrapport', margin + 24, 17);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(200, 210, 204);
    doc.text('Handelsadministratie · ' + owner, margin + 24, 24);
    doc.text('Gegenereerd op ' + new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) +
             ' om ' + new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
             margin + 24, 29);

    y = 46;

    // Periode-balk
    doc.setFillColor(...COLORS.card2);
    doc.roundedRect(margin, y, contentW, 12, 2, 2, 'F');
    doc.setTextColor(...COLORS.text);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Periode: ' + fmtDateShortNL(week.period.currentStart) + ' — ' + fmtDateShortNL(week.period.currentEnd),
             margin + 5, y + 7.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textMuted);
    doc.text('Vergelijking met vorige week (' + fmtDateShortNL(week.period.previousStart) + ' — ' + fmtDateShortNL(week.period.previousEnd) + ')',
             pageW - margin - 5, y + 7.5, { align: 'right' });
    y += 20;

    // ═══════════════════════════════════════════════════════
    // SECTIE 1: Weekvergelijking (4 metrics in 2x2 grid)
    // ═══════════════════════════════════════════════════════
    y = drawSectionTitle(doc, 'Weekvergelijking', y, margin, contentW);
    y += 2;

    const metrics = [
      { label: 'Winst',         current: week.current.profit,         prev: week.previous.profit,         delta: week.deltas.profit,         money: true,  color: COLORS.success,  soft: COLORS.successSoft },
      { label: 'Omzet',         current: week.current.revenue,        prev: week.previous.revenue,        delta: week.deltas.revenue,        money: true,  color: COLORS.info,     soft: COLORS.infoSoft },
      { label: 'Nieuwe klanten', current: week.current.newCustomers,  prev: week.previous.newCustomers,   delta: week.deltas.newCustomers,   money: false, color: COLORS.lavender, soft: COLORS.lavenderSoft },
      { label: 'Lage voorraad',  current: week.current.lowStockCount, prev: week.previous.lowStockCount,  delta: week.deltas.lowStockCount,  money: false, color: COLORS.danger,   soft: COLORS.dangerSoft, inverted: true }
    ];

    const cardW = (contentW - 6) / 2; // 2 kolommen, 6mm gap
    const cardH = 30;
    metrics.forEach(function (m, i) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = margin + col * (cardW + 6);
      const cy = y + row * (cardH + 4);

      // Card achtergrond
      doc.setFillColor(...COLORS.white);
      doc.setDrawColor(...COLORS.border);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, cy, cardW, cardH, 2, 2, 'FD');

      // Klein gekleurd blokje links (accent)
      doc.setFillColor(...m.soft);
      doc.roundedRect(x, cy, 3, cardH, 1.5, 1.5, 'F');
      // Overschrijf rechterkant van het blokje zodat het een linkerstreep wordt
      doc.setFillColor(...COLORS.white);
      doc.rect(x + 1.5, cy, 1.5, cardH, 'F');

      // Label
      doc.setTextColor(...COLORS.textMuted);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(m.label.toUpperCase(), x + 6, cy + 6);

      // Huidige waarde (groot)
      doc.setTextColor(...COLORS.text);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      const curStr = m.money ? fmtEuro(m.current) : fmtNum(m.current);
      doc.text(curStr, x + 6, cy + 15);

      // Vorige week
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...COLORS.textMuted);
      const prevStr = m.money ? fmtEuro(m.prev) : fmtNum(m.prev);
      doc.text('Vorige week: ' + prevStr, x + 6, cy + 21);

      // Delta-badge
      const isPos = deltaIsPositive(m.delta, m.inverted);
      const badgeColor = isPos === null ? COLORS.textFaint : (isPos ? COLORS.success : COLORS.danger);
      const badgeSoft = isPos === null ? COLORS.card2 : (isPos ? COLORS.successSoft : COLORS.dangerSoft);
      const deltaText = fmtDelta(m.delta, { money: m.money });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      const textW = doc.getTextWidth(deltaText) + 4;
      doc.setFillColor(...badgeSoft);
      doc.roundedRect(x + 6, cy + 23.5, textW, 4.5, 1, 1, 'F');
      doc.setTextColor(...badgeColor);
      doc.text(deltaText, x + 8, cy + 26.5);
    });

    y += 2 * (cardH + 4) + 4;

    // ═══════════════════════════════════════════════════════
    // SECTIE 2: Top producten
    // ═══════════════════════════════════════════════════════
    if (y > pageH - 60) { doc.addPage(); y = margin; }
    y = drawSectionTitle(doc, 'Top producten deze week', y, margin, contentW);
    y += 2;

    if (week.current.topProducts.length === 0) {
      doc.setFillColor(...COLORS.card2);
      doc.roundedRect(margin, y, contentW, 14, 2, 2, 'F');
      doc.setTextColor(...COLORS.textMuted);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.text('Geen verkopen deze week.', margin + 5, y + 8);
      y += 18;
    } else {
      // Tabel-header
      doc.setFillColor(...COLORS.sidebarBg);
      doc.roundedRect(margin, y, contentW, 8, 1, 1, 'F');
      doc.setTextColor(...COLORS.white);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('#', margin + 4, y + 5.5);
      doc.text('Product', margin + 12, y + 5.5);
      doc.text('Aantal', pageW - margin - 60, y + 5.5, { align: 'right' });
      doc.text('Omzet', pageW - margin - 32, y + 5.5, { align: 'right' });
      doc.text('Winst', pageW - margin - 4, y + 5.5, { align: 'right' });
      y += 8;

      week.current.topProducts.forEach(function (p, i) {
        if (y > pageH - 20) { doc.addPage(); y = margin; }
        // Zebrastreep
        if (i % 2 === 0) {
          doc.setFillColor(...COLORS.card2);
          doc.rect(margin, y, contentW, 8, 'F');
        }
        doc.setTextColor(...COLORS.text);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(String(i + 1), margin + 4, y + 5.5);
        doc.setFont('helvetica', 'normal');
        // Truncate product name if too long
        let name = p.name || '(onbekend)';
        if (name.length > 50) name = name.slice(0, 47) + '…';
        doc.text(name, margin + 12, y + 5.5);
        doc.setTextColor(...COLORS.textMuted);
        doc.setFontSize(9.5);
        doc.text(String(p.count), pageW - margin - 60, y + 5.5, { align: 'right' });
        doc.text(fmtEuro(p.revenue), pageW - margin - 32, y + 5.5, { align: 'right' });
        doc.setTextColor(...COLORS.success);
        doc.text(fmtEuro(p.profit), pageW - margin - 4, y + 5.5, { align: 'right' });
        y += 8;
      });
      y += 6;
    }

    // ═══════════════════════════════════════════════════════
    // SECTIE 3: Totale statistieken (snapshot)
    // ═══════════════════════════════════════════════════════
    if (y > pageH - 50) { doc.addPage(); y = margin; }
    y = drawSectionTitle(doc, 'Totale statistieken (all-time)', y, margin, contentW);
    y += 2;

    const totalStats = [
      { label: 'Totale winst', value: fmtEuro(stats.totalProfit), color: COLORS.success },
      { label: 'Totale omzet', value: fmtEuro(stats.totalRevenue), color: COLORS.info },
      { label: 'Geïnvesteerd', value: fmtEuro(stats.totalInvested), color: COLORS.warn },
      { label: 'Voorraadwaarde', value: fmtEuro(stats.totalStockValue), color: COLORS.lavender },
      { label: 'Producten', value: fmtNum(stats.totalProducts), color: COLORS.primary },
      { label: 'Klanten', value: fmtNum(stats.customersCount), color: COLORS.primary2 }
    ];
    const statCardW = (contentW - 10) / 3;
    const statCardH = 18;
    totalStats.forEach(function (s, i) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = margin + col * (statCardW + 5);
      const cy = y + row * (statCardH + 4);
      doc.setFillColor(...COLORS.white);
      doc.setDrawColor(...COLORS.border);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, cy, statCardW, statCardH, 2, 2, 'FD');
      doc.setTextColor(...COLORS.textMuted);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(s.label.toUpperCase(), x + 4, cy + 5.5);
      doc.setTextColor(...s.color);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(s.value, x + 4, cy + 12.5);
    });
    y += 2 * (statCardH + 4) + 4;

    // ═══════════════════════════════════════════════════════
    // SECTIE 4: Komende herinneringen (agenda)
    // ═══════════════════════════════════════════════════════
    if (y > pageH - 50) { doc.addPage(); y = margin; }
    y = drawSectionTitle(doc, 'Komende herinneringen (7 dagen)', y, margin, contentW);
    y += 2;

    if (upcoming.items.length === 0) {
      doc.setFillColor(...COLORS.card2);
      doc.roundedRect(margin, y, contentW, 14, 2, 2, 'F');
      doc.setTextColor(...COLORS.textMuted);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.text('Geen herinneringen voor de komende 7 dagen.', margin + 5, y + 8);
      y += 18;
    } else {
      // Tabel-header
      doc.setFillColor(...COLORS.sidebarBg);
      doc.roundedRect(margin, y, contentW, 8, 1, 1, 'F');
      doc.setTextColor(...COLORS.white);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('Datum', margin + 4, y + 5.5);
      doc.text('Tijd', margin + 40, y + 5.5);
      doc.text('Titel', margin + 58, y + 5.5);
      doc.text('Type', pageW - margin - 4, y + 5.5, { align: 'right' });
      y += 8;
      upcoming.items.slice(0, 8).forEach(function (e, i) {
        if (y > pageH - 20) { doc.addPage(); y = margin; }
        if (i % 2 === 0) {
          doc.setFillColor(...COLORS.card2);
          doc.rect(margin, y, contentW, 8, 'F');
        }
        doc.setTextColor(...COLORS.text);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.text(fmtDateShortNL(e.date), margin + 4, y + 5.5);
        doc.setTextColor(...COLORS.textMuted);
        doc.text(e.time || '—hele dag—', margin + 40, y + 5.5);
        doc.setTextColor(...COLORS.text);
        doc.setFont('helvetica', 'bold');
        let title = e.title || '(geen titel)';
        if (title.length > 60) title = title.slice(0, 57) + '…';
        doc.text(title, margin + 58, y + 5.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.textMuted);
        doc.setFontSize(8.5);
        doc.text((D().AGENDA_TYPE_META[e.type] || {}).label || e.type, pageW - margin - 4, y + 5.5, { align: 'right' });
        y += 8;
      });
      y += 6;
    }

    // ═══════════════════════════════════════════════════════
    // FOOTER (op elke pagina)
    // ═══════════════════════════════════════════════════════
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      // Dunne groene lijn
      doc.setDrawColor(...COLORS.primary);
      doc.setLineWidth(0.5);
      doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
      // Tekst
      doc.setTextColor(...COLORS.textMuted);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(companyName + ' · ' + owner, margin, pageH - 9);
      doc.text('Vertrouwelijk — alleen voor intern gebruik', pageW / 2, pageH - 9, { align: 'center' });
      doc.text('Pagina ' + p + ' van ' + pageCount, pageW - margin, pageH - 9, { align: 'right' });
    }

    // ── Download ──
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    const fileName = opts.fileName || ('lagenco-weekrapport-' + dateStr + '.pdf');
    doc.save(fileName);

    if (window.toast) {
      window.toast('Rapport gegenereerd', fileName + ' is gedownload', 'success');
    }
  }

  /** Tekent een sectie-titel met groene streep eronder. */
  function drawSectionTitle(doc, title, y, margin, contentW) {
    doc.setTextColor(...COLORS.sidebarBg);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(title, margin, y + 4);
    // Groene streep
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(0.8);
    doc.line(margin, y + 6, margin + contentW, y + 6);
    return y + 8;
  }

  // ────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────
  window.LagencoReport = {
    generateWeeklyReport: generateWeeklyReport
  };
})(window, document);
