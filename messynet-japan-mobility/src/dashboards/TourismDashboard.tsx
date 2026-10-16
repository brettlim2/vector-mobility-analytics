import { useState } from 'react'
import type { Tourism } from '../lib/types'
import { GlassPanel, SectionHeader, SubLabel, KpiTile, AnswerCard, Note, BarRow, StackedShare, FeasibilityTable, SectionNav, Empty } from '../components/ui'
import { HeatMatrix, FlowMap, JourneyLine, SplitBar } from '../components/charts'
import { StoryBoard } from '../components/story'
import { TEAL, TEAL_LT, VOLT, WIRE, PRIMARY, CONTEXT } from '../lib/palette'
import { fmtInt, fmtPct } from '../lib/format'
import { makeL, tx, type Locale } from '../lib/i18n'

// Copy rule for this page: "home country" for what the SIM tells us, airport names before codes,
// "landed elsewhere first" instead of "indirect".
export function TourismDashboard({ t, locale = 'en' }: { t: Tourism | null | undefined; locale?: Locale }) {
  const [market, setMarket] = useState('ALL')
  const L = makeL(locale)
  if (!t) return <Empty note={L('The tourism readout has not loaded.', '観光レポートを読み込めませんでした。')} />

  const nat = t.nationality
  const markets = nat.by_market
  const marketLabel = (id: string) => (id === 'ALL' ? L('All regions', 'すべての地域') : tx(markets.find((m) => m.market === id)?.label, locale))
  const airportName = (id: string) => tx(t.airports.find((a) => a.id === id)?.label, locale) || id
  const destLabel = (id: string) => tx(t.destinations.find((d) => d.id === id)?.label, locale)
  const agg = t.by_market[market] ?? t.by_market.ALL
  const all = t.by_market.ALL
  const topAirport = all.airports[0]
  const top = t.route_candidates[0]
  // the headline example is the largest flow that is NOT simply "Tokyo arrivals touring Kansai"
  const hero = t.route_candidates.find((r) => r.gateway === 'CTS') ?? top
  const golden = t.golden_route
  const seqText = (i: { airport: string; seq: string[] }) => [airportName(i.airport), ...i.seq.map(destLabel)].join(' → ')
  const viaText = hero.via.map((x) => airportName(x.airport)).join(L(' and ', '・'))
  const viaTokyo = hero.via.every((x) => x.airport === 'NRT' || x.airport === 'HND')
  const heroMarket = marketLabel(hero.market), heroRegion = tx(hero.region, locale)
  const pct = (x: number) => Math.round(x * 100)
  // when the hero market is selected, light up the connections behind the headline
  const heroZones = t.destinations.filter((d) => d.gateways.includes(hero.gateway)).map((d) => d.id)
  const heroFlows = market === hero.market ? agg.flows.filter((f) => f.airport !== hero.gateway && heroZones.includes(f.zone)).map((f) => `${f.airport}>${f.zone}`) : []
  // choosing a country anywhere on the page should show its effect, so bring the map into view
  const pick = (id: string, scroll = true) => {
    setMarket(id)
    if (scroll) document.getElementById('sec-where')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const navItems = [
    { id: 'sec-verdict', label: L('Answers', '回答') },
    { id: 'sec-who', label: L('Who arrives', '誰が来るか') },
    { id: 'sec-where', label: L('Where they go', 'どこへ行くか') },
    { id: 'sec-routes', label: L('Route ideas', '路線の検討材料') },
    { id: 'sec-feasibility', label: L('What we need from you', 'ご用意いただくもの') },
  ]

  return (
    <div className="flex flex-col gap-4">
      <StoryBoard
        kicker={L(`Airlines × Domestic tourism · what the data says · September, ${t.window.days} days`, `航空会社 × 国内観光 · データが示すこと · 9月（${t.window.days}日間）`)}
        headline={viaTokyo && hero.indirect_share >= 0.4 && hero.indirect_share <= 0.6
          ? L(`About half of ${heroRegion}’s visitors from ${heroMarket} fly into Tokyo first: the clearest route signal in this data`, `${heroRegion}を訪れる${heroMarket}の旅行者の約半数は、まず東京に到着しています。今回のデータで最も明確な路線のシグナルです`)
          : L(`${pct(hero.indirect_share)} in 100 of ${heroRegion}’s visitors from ${heroMarket} land at another airport first: the clearest route signal in this data`, `${heroRegion}を訪れる${heroMarket}の旅行者の${pct(hero.indirect_share)}%は、まず別の空港に到着しています。今回のデータで最も明確な路線のシグナルです`)}
        sub={L('Read it as evidence of demand, not a finished route case: current schedules, fares and a full year of data still need to be laid over it.',
               '路線計画の結論ではなく、需要の裏付けとしてお読みください。現行ダイヤ、運賃、通年のデータを重ねる必要があります。')}
        evidenceLabel={L('See the evidence', '根拠を見る')}
        points={[
          { figure: `${pct(hero.indirect_share)}%`, href: '#sec-routes',
            claim: L(`of visitors from ${heroMarket} staying in ${heroRegion} landed at another airport first`, `${heroRegion}に滞在した${heroMarket}の旅行者のうち、別の空港に先に到着した割合`),
            visual: <div>
              <SplitBar height={16} parts={[
                { label: L(`landed at ${airportName(hero.gateway)}`, `${airportName(hero.gateway)}に到着`), value: hero.direct_arrivals, color: CONTEXT },
                { label: L('landed elsewhere first', '別の空港に先に到着'), value: hero.indirect_arrivals, color: PRIMARY },
              ]} />
              <div className="mt-1.5 flex justify-between text-[12px] text-[var(--mn-mist)]">
                <span>{L(`landed at ${airportName(hero.gateway)} ${fmtInt(hero.direct_arrivals)}`, `${airportName(hero.gateway)}に到着 ${fmtInt(hero.direct_arrivals)}`)}</span>
                <span className="font-semibold text-[var(--mn-heading)]">{L(`landed elsewhere ${fmtInt(hero.indirect_arrivals)}`, `別の空港 ${fmtInt(hero.indirect_arrivals)}`)}</span>
              </div>
            </div>,
            soWhat: L(`${fmtInt(hero.indirect_arrivals)} visitors in our sample made that connection, mostly via ${viaText}. Check it against current schedules before calling it a gap.`,
                      `サンプル内で${fmtInt(hero.indirect_arrivals)}人がこの乗り継ぎをしており、主に${viaText}経由です。「路線の空白」と判断する前に、現行ダイヤと照合します。`) },
          { figure: `${pct(all.multi_destination_share)}%`, href: '#sec-where',
            claim: L('of trips take in two or more places', '2か所以上を訪れる旅行の割合'),
            visual: <div className="rounded-[var(--mn-radius-sm)] border border-[var(--mn-wire)] px-2.5 py-2"><JourneyLine airport={airportName(golden.airport)} stops={golden.seq.map(destLabel)} count={golden.devices} /></div>,
            soWhat: L('Visitors land in one place and spend their nights in several. A route’s value reaches well beyond its arrival city.',
                      '旅行者は1か所に到着し、複数の場所に宿泊します。路線の価値は到着都市にとどまりません。') },
          { figure: `${pct(nat.coverage)}%`, href: '#sec-who',
            claim: L('of travellers have an identified home region', '居住地域が判別できる旅行者の割合'),
            visual: <div>
              <SplitBar height={16} parts={[
                { label: L('day trip', '日帰り'), value: nat.class_counts.day_trip, color: CONTEXT },
                { label: L('overnight', '宿泊'), value: nat.class_counts.overnight, color: PRIMARY },
                { label: L('multi-region', '複数地域'), value: nat.class_counts.multi_region, color: 'var(--viz-track)' },
              ]} />
              <div className="mt-1.5 flex flex-wrap gap-x-3 text-[12px] text-[var(--mn-mist)]">
                <span className="font-semibold text-[var(--mn-heading)]">{L('overnight: stayed', '宿泊：滞在あり')}</span>
                <span>{L('day trip: no overnight', '日帰り：宿泊なし')}</span>
                <span>{L('multi-region: 2+ regions', '複数地域：2地域以上')}</span>
              </div>
            </div>,
            soWhat: L('Home region comes from where each device spends its nights, so we can compare which parts of Japan travel where.',
                      '居住地域は夜間の滞在地から推定します。日本のどの地域からどこへ旅行しているかを比較できます。') },
        ]}
        nextTitle={L('What we would do next', '次のステップ')}
        next={[
          L('Lay your current schedules and seat data over the "landed elsewhere" table.', '「別の空港に到着」の表に、現行ダイヤと座席データを重ねます。'),
          L('Extend to a full year, so ski season and holiday peaks are in.', '通年に広げ、スキーシーズンや休暇期のピークを含めます。'),
          L('Pick two or three candidate routes for a deeper read.', '候補路線を2〜3本選び、詳しく分析します。'),
        ]} />

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <KpiTile label={L('Busiest gateway', '最も多い玄関口')} value={airportName(topAirport.airport)}
          sub={L(`${fmtPct(topAirport.share)} of travellers’ first gateway`, `旅行者の最初の玄関口の${fmtPct(topAirport.share)}`)} />
        <KpiTile label={L('Places visited per trip', '1回の旅行で訪れる場所')} value={all.avg_destinations.toFixed(1)} sub={L('on average', '平均')} />
        <KpiTile label={L('Nights away', '滞在日数')} value={L(all.avg_nights.toFixed(1), `${all.avg_nights.toFixed(1)}泊`)} sub={L('on average', '平均')} />
        <KpiTile label={L('Domestic travellers in sample', 'サンプル内の国内旅行者')} value={fmtInt(t.inbound_cohort)}
          sub={L('September only · a route case needs a full year', '9月のみ · 路線検討には通年が必要')} />
      </div>

      <SectionNav items={navItems} label={L('Sections', 'セクション')} />

      <GlassPanel id="sec-verdict" className="p-5 scroll-mt-28">
        <SectionHeader kicker={L('Answers', '回答')} title={L('Your questions', 'いただいたご質問')} />
        <div className="grid gap-3 lg:grid-cols-3">
          <AnswerCard q={L('Can we identify where domestic travellers come from and which regions they move between?', '国内旅行者がどの地域から来て、どの地域間を移動しているか特定できますか？')}
            badge={L('Yes', 'はい')} badgeColor={VOLT}
            answer={L(`For about ${Math.round(nat.coverage * 100)} in 100 travellers we can read a home region from where their device spends its nights.`, `旅行者100人中およそ${Math.round(nat.coverage * 100)}人について、夜間の滞在地から居住地域を判別できます。`)}>
            {L('Each device’s home region is the part of Japan where it is seen overnight most often; a traveller is a device that then stays in a different region. This is a domestic resident panel, so it shows Japanese travellers moving between regions — not inbound visitors by nationality (that needs a foreign-carrier or passport signal this panel does not carry). Counts are a sample over absolute numbers.',
               '各デバイスの居住地域は、夜間に最も多く観測される地域です。旅行者は、その後別の地域に滞在したデバイスです。これは国内居住者パネルのため、国内旅行者の地域間移動を示します。国籍別のインバウンド訪問者（海外キャリアやパスポートの信号が必要）は対象外です。数値は実数ではなくサンプルです。')}
          </AnswerCard>
          <AnswerCard q={L('Can we see which destinations they visit? (Arriving at Haneda, then travelling to Kyoto, Osaka and Gotemba.)', '訪問先は分かりますか？（例：羽田に到着し、京都・大阪・御殿場へ）')}
            badge={L('Yes', 'はい')} badgeColor={VOLT}
            answer={L('Yes. We see the arrival airport and each place they stay, in order.', 'はい。到着空港と、滞在した場所を順番に把握できます。')}>
            {L(`For example, ${fmtInt(golden.devices)} visitors followed ${seqText(golden)}, and ${fmtInt(golden.all_airports)} combined Kyoto with Gotemba / Fuji–Hakone whichever airport they used. ${Math.round(all.multi_destination_share * 100)} in 100 trips take in two or more places.`,
               `例えば、${seqText(golden)} の順に巡った旅行者は${fmtInt(golden.devices)}人、到着空港を問わず京都と御殿場・富士箱根を組み合わせた旅行者は${fmtInt(golden.all_airports)}人でした。100件の旅行のうち${Math.round(all.multi_destination_share * 100)}件が2か所以上を訪れています。`)}
          </AnswerCard>
          <AnswerCard q={L('Could this support the evaluation of potential new routes?', '新規路線の検討に活用できますか？')}
            badge={L('Yes, as demand evidence', '需要の裏付けとして可')} badgeColor={TEAL_LT}
            answer={L('Yes, as evidence of demand. It shows where each country’s visitors end up, compared with where they land.', '需要の裏付けとして活用できます。各国・地域の旅行者が「降りた空港」と「実際の行き先」の差が見えます。')}>
            {L(`For example, ${Math.round(hero.indirect_share * 100)} in 100 visitors from ${marketLabel(hero.market)} who stayed in ${tx(hero.region, locale)} landed at another airport first, mostly ${viaText}. That tells you how many people are making the connection today. It does not cover fares, slots, aircraft, or Japanese travellers going the other way; those come from your own data.`,
               `例えば、${tx(hero.region, locale)}に滞在した${marketLabel(hero.market)}からの旅行者100人のうち${Math.round(hero.indirect_share * 100)}人は、まず別の空港（主に${viaText}）に到着していました。現在どれだけの人が乗り継いでいるかが分かります。運賃、発着枠、機材、日本発の需要は対象外で、貴社のデータが必要です。`)}
          </AnswerCard>
        </div>
      </GlassPanel>

      <div id="sec-who" className="grid lg:grid-cols-2 gap-4 scroll-mt-28">
        <GlassPanel className="p-5">
          <SectionHeader kicker={L('Who travels', '誰が旅行するか')} title={L('Where do domestic travellers come from?', '国内旅行者はどの地域から来るか')}
            sub={L('Every traveller in the sample, by the kind of trip they took.', 'サンプル内の旅行者を、旅行の種類別に分類。')} />
          <StackedShare parts={[
            { label: L('Overnight · stayed in region', '宿泊 · 地域に滞在'), value: nat.class_counts.overnight, color: PRIMARY },
            { label: L('Day trip · no overnight', '日帰り · 宿泊なし'), value: nat.class_counts.day_trip, color: CONTEXT },
            { label: L('Multi-region · 2+ regions', '複数地域 · 2地域以上'), value: nat.class_counts.multi_region, color: WIRE },
          ]} />
          <SubLabel className="mt-5">{L('Travellers by home region', '居住地域別の旅行者')}</SubLabel>
          <BarRow items={markets.map((m) => ({ label: tx(m.label, locale), value: m.devices }))} highlight={(l) => market !== 'ALL' && l === marketLabel(market)} />
          <div className="mt-3"><Note>
            {L('Who counts as a traveller here: a device whose home region (where it is seen overnight most often) differs from a region it then stayed in, entering that region through a gateway (airport or hub). Devices that never leave their home region are not counted.',
               'ここでの「旅行者」とは、居住地域（夜間に最も多く観測される地域）とは異なる地域に滞在し、玄関口（空港・拠点）を経由して入ったデバイスです。居住地域から出ないデバイスは含まれません。')}
          </Note></div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--mn-mist)]">
            {L('This is a domestic resident panel. It shows Japanese travellers moving between regions; it does not identify inbound visitors by nationality. Counts are a corrected-sample pattern, not absolute arrivals.',
               'これは国内居住者パネルです。国内旅行者の地域間移動を示し、国籍別のインバウンド訪問者は特定しません。数値は補正済みサンプルのパターンであり、実数ではありません。')}
          </p>
        </GlassPanel>
        <GlassPanel className="p-5">
          <SectionHeader kicker={L('Which gateway', 'どの玄関口か')} title={L('Gateway by home region', '居住地域別の玄関口')}
            sub={L('Out of every 100 travellers from each region, how many enter through each gateway. Click a region to see where its travellers go.', '各地域の旅行者100人が、どの玄関口から入るか。地域名をクリックすると、その行き先を表示します。')} />
          <HeatMatrix selected={market} onSelect={(id) => pick(id === market ? 'ALL' : id)}
            cols={t.airports.map((a) => ({ id: a.id, label: tx(a.label, locale) }))}
            rows={t.market_airport_matrix.map((r) => ({ id: r.market, label: marketLabel(r.market), values: r.shares }))} />
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-[var(--mn-mist)]">
            {t.airports.map((a) => <span key={a.id}><span className="font-mono text-[var(--mn-ice)]">{a.id}</span> {tx(a.label, locale)}</span>)}
          </div>
        </GlassPanel>
      </div>

      <GlassPanel id="sec-where" className="p-5 scroll-mt-28">
        <div className="flex flex-wrap items-start justify-between gap-x-3">
          <SectionHeader kicker={L('Where they go', 'どこへ行くか')} title={L(`${marketLabel(market)}: from arrival airport to the places they stay`, `${marketLabel(market)}：到着空港から滞在先へ`)}
            sub={L(`${fmtInt(agg.devices)} visitors · ${agg.avg_destinations.toFixed(1)} places and ${agg.avg_nights.toFixed(1)} nights per trip on average.`,
                   `旅行者${fmtInt(agg.devices)}人 · 1回の旅行で平均${agg.avg_destinations.toFixed(1)}か所・${agg.avg_nights.toFixed(1)}泊。`)} />
          <div className="mb-3 flex max-w-[640px] flex-wrap gap-1 lg:justify-end" role="group" aria-label={L('Home country', '出身国・地域')}>
            {['ALL', ...markets.map((m) => m.market)].map((id) => (
              <button key={id} type="button" onClick={() => pick(id, false)} aria-pressed={market === id}
                className="rounded-[var(--mn-radius-btn)] border px-2.5 py-1.5 text-[12px] hover:text-[var(--mn-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mn-volt)]"
                style={{ borderColor: market === id ? 'var(--mn-teal)' : 'var(--mn-wire)', background: market === id ? 'var(--mn-callout-bg)' : 'transparent', color: market === id ? 'var(--mn-heading)' : 'var(--mn-body)' }}>
                {marketLabel(id)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <FlowMap t={t} agg={agg} locale={locale} highlight={heroFlows} />
            {heroFlows.length > 0 && <p className="mt-2 text-[13.5px] text-[var(--mn-body)]">{L(`Highlighted: ${heroMarket} visitors who landed elsewhere and travelled on to ${heroRegion}.`, `強調表示：別の空港に到着してから${heroRegion}へ向かった${heroMarket}の旅行者。`)}</p>}
          </div>
          <div>
            <SubLabel>{L('Places they stayed', '滞在した場所')}</SubLabel>
            <BarRow items={agg.destinations.slice(0, 10).map((d) => ({ label: destLabel(d.zone), value: d.visitors }))} color={TEAL_LT} />
            <SubLabel className="mt-5">{L('Most common trips, in the order travelled', '主な旅程（訪問順）')}</SubLabel>
            <div className="flex flex-col gap-1.5">
              {agg.itineraries.map((i) => (
                <div key={`${i.airport}>${i.seq.join('>')}`} className="rounded-[var(--mn-radius-sm)] border border-[var(--mn-wire)] bg-[var(--mn-abyss)] px-2.5 py-2">
                  <JourneyLine airport={airportName(i.airport)} stops={i.seq.map(destLabel)} count={i.devices} share={fmtPct(i.share)} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[13.5px] text-[var(--mn-mist)]">{L('✈ marks the arrival airport. Numbers are visitors in our sample.', '✈は到着空港。数値はサンプル内の旅行者数です。')}</p>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel id="sec-routes" className="p-5 scroll-mt-28">
        <SectionHeader kicker={L('Route ideas', '路線の検討材料')} title={L('Visitors who reach a region after landing somewhere else', '別の空港に到着してから、その地域へ向かった旅行者')}
          sub={L('For each country and region: of the visitors who stayed there, how many landed at the region’s own airport and how many landed elsewhere and travelled on. Largest "landed elsewhere" groups first.',
                 '国・地域と訪問地域の組み合わせごとに、その地域に滞在した旅行者を「地域の空港に到着」と「別の空港に到着して移動」に分けています。後者が多い順。')} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="text-[12px] text-[var(--mn-mist)]">
                {[L('From → region (its airport)', '出身 → 地域（その空港）'), L('Visitors staying in the region', '地域に滞在した旅行者'), L('Landed elsewhere', '別の空港に到着'), L('% of the region’s visitors', '地域滞在者に占める割合'), L('Where they landed instead', '実際の到着空港'), L('Nights there', '滞在泊数')].map((h, i) => (
                  <th key={h} className={`border-b border-[var(--mn-wire)] px-2 py-1.5 font-normal ${i === 2 || i === 3 || i === 5 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const max = Math.max(1, ...t.route_candidates.map((r) => r.region_visitors))
                return t.route_candidates.map((r) => {
                  const sel = market !== 'ALL' && r.market === market
                  const isHero = r === hero
                  return (
                    <tr key={`${r.market}>${r.gateway}`} style={{ background: sel ? 'var(--mn-callout-bg)' : undefined }}>
                      <td className="border-b border-[var(--mn-wire-subtle)] px-2 py-1.5 whitespace-nowrap">
                        <button type="button" onClick={() => pick(r.market)} title={L('Show this country on the map', 'この国・地域を地図に表示')}
                          className="text-left underline decoration-[var(--mn-border)] underline-offset-2 hover:text-[var(--mn-teal)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mn-volt)]" style={{ color: 'var(--mn-heading)' }}>
                          {marketLabel(r.market)}
                        </button>
                        <span className="text-[var(--mn-teal)]"> → </span>{tx(r.region, locale)}{airportName(r.gateway) !== tx(r.region, locale) && <span className="text-[var(--mn-mist)]"> ({L(`${airportName(r.gateway)} airport`, `${airportName(r.gateway)}空港`)})</span>}
                      </td>
                      <td className="border-b border-[var(--mn-wire-subtle)] px-2 py-1.5 w-[24%]">
                        <div className="flex items-center gap-2">
                          <div className="flex h-[12px] overflow-hidden rounded-[3px]" style={{ width: `${(r.region_visitors / max) * 100}%`, minWidth: 24 }}
                            title={L(`${fmtInt(r.direct_arrivals)} landed at the region's airport · ${fmtInt(r.indirect_arrivals)} landed elsewhere`, `地域の空港に到着 ${fmtInt(r.direct_arrivals)} · 別の空港に到着 ${fmtInt(r.indirect_arrivals)}`)}>
                            <div style={{ width: `${(r.direct_arrivals / r.region_visitors) * 100}%`, background: WIRE }} />
                            <div style={{ flex: 1, background: isHero ? VOLT : TEAL }} />
                          </div>
                          <span className="font-mono text-[var(--mn-mist)]">{fmtInt(r.region_visitors)}</span>
                        </div>
                      </td>
                      <td className="border-b border-[var(--mn-wire-subtle)] px-2 py-1.5 text-right font-mono" style={{ color: isHero ? VOLT : 'var(--mn-ice)' }}>{fmtInt(r.indirect_arrivals)}</td>
                      <td className="border-b border-[var(--mn-wire-subtle)] px-2 py-1.5 text-right font-mono text-[var(--mn-ice)]">{fmtPct(r.indirect_share)}</td>
                      <td className="border-b border-[var(--mn-wire-subtle)] px-2 py-1.5 text-[var(--mn-mist)]">{r.via.map((x) => `${airportName(x.airport)} ${fmtInt(x.devices)}`).join(' · ')}</td>
                      <td className="border-b border-[var(--mn-wire-subtle)] px-2 py-1.5 text-right font-mono text-[var(--mn-mist)]">{r.avg_region_nights.toFixed(1)}</td>
                    </tr>
                  )
                })
              })()}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--mn-mist)]">
          <span><span style={{ background: WIRE }} className="inline-block h-2.5 w-2.5 rounded-[2px] align-middle mr-1" />{L('landed at the region’s airport', '地域の空港に到着')}</span>
          <span><span style={{ background: TEAL }} className="inline-block h-2.5 w-2.5 rounded-[2px] align-middle mr-1" />{L('landed elsewhere, then travelled on', '別の空港に到着して移動')}</span>
          <span><span style={{ background: VOLT }} className="inline-block h-2.5 w-2.5 rounded-[2px] align-middle mr-1" />{L('the example used above', '上記で取り上げた例')}</span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Note>
            {L(`How to read it: the top rows are Tokyo arrivals touring Kyoto and Osaka (${marketLabel(top.market)}: ${fmtInt(top.indirect_arrivals)}). That is the classic tourist route and both ends already have many flights. The rows worth a closer look are regions people reach mainly by a domestic connection, such as ${marketLabel(hero.market)} → ${tx(hero.region, locale)}.`,
               `読み方：上位は東京に到着して京都・大阪を巡る流れです（${marketLabel(top.market)}：${fmtInt(top.indirect_arrivals)}人）。定番の周遊ルートで、両端ともすでに便数が豊富です。注目すべきは、主に国内線の乗り継ぎで到達している地域（例：${marketLabel(hero.market)} → ${tx(hero.region, locale)}）です。`)}
          </Note>
          <Note>
            {L('What this does not tell you: which city the visitor flew from, or which airline they used. Whether a direct flight already exists, and how often, needs to be checked against current schedules before any row is treated as a gap.',
               'ここから分からないこと：旅行者の出発都市と利用航空会社。直行便の有無や便数は現行ダイヤと照合する必要があり、それまではどの行も「路線の空白」とは言えません。')}
          </Note>
        </div>
      </GlassPanel>

      <GlassPanel id="sec-feasibility" className="p-5 scroll-mt-28">
        <SectionHeader kicker={L('What we need from you', 'ご用意いただくもの')} title={L('What we can answer today, and what it takes', '現時点でお答えできること、そのために必要なもの')} />
        <FeasibilityTable head={[L('Your question', 'ご質問'), L('Can we answer it?', '回答可否'), L('How we measure it', '測り方'), L('What else is needed', '併せて必要なもの')]}
          rows={[
            { ask: L('Which region are travellers from?', '旅行者の居住地域'), status: 'yes', statusLabel: L('Yes', 'はい'),
              how: L('Home region is where the device is seen overnight most often. This is a domestic resident panel, so it reads home region well — but it does not identify inbound visitors by nationality.', '居住地域は、夜間に最も多く観測される地域です。国内居住者パネルのため居住地域はよく判別できますが、国籍別のインバウンド訪問者は特定しません。'),
              needs: L('For inbound nationality you would need a foreign-carrier or passport signal this panel does not carry.', '国籍別インバウンドには、本パネルにない海外キャリアまたはパスポートの信号が必要です。') },
            { ask: L('Which gateway do they enter a region through?', '地域に入る玄関口'), status: 'partial', statusLabel: L('For most', '大半について可'),
              how: L('The airport or hub nearest the first stop in the first region they travel to.', '最初に向かった地域での最初の滞在地に最も近い空港・拠点で判定します。'),
              needs: L('Your list of gateways (airports and shinkansen hubs) to treat as entry points.', '玄関口として扱う空港・新幹線拠点のリスト。') },
            { ask: L('Where do they go, and in what order? (Tokyo → Nagoya → Osaka)', '訪問先とその順序（東京 → 名古屋 → 大阪）'), status: 'yes', statusLabel: L('Yes', 'はい'),
              how: L('Each region the traveller stays in after leaving home, put in time order.', '居住地を離れた後に滞在した地域を時系列で並べます。'),
              needs: L('Your list of destinations of interest, and how long counts as a stay rather than passing through.', 'ご関心のある訪問先のリストと、「通過」ではなく「滞在」とみなす時間の基準。') },
            { ask: L('Should we open a new route?', '新規路線を開設すべきか'), status: 'partial', statusLabel: L('Demand side only', '需要面のみ'),
              how: L('How many travellers reach a region by entering through another region’s gateway first, and how long they stay. That is the size of today’s connecting demand.', 'ある地域の旅行者のうち、別の地域の玄関口から入ってからその地域へ向かった人数と滞在泊数。現在の乗り継ぎ需要の規模を示します。'),
              needs: L('Current schedules and seats, fares, and a full year of data to cover the seasons.', '現行ダイヤと座席数、運賃、季節変動を捉えるための通年データ。') },
            { ask: L('Inbound visitors by nationality?', '国籍別のインバウンド訪問者'), status: 'no', statusLabel: L('Not from this panel', '本パネルでは不可'),
              how: L('This is a domestic resident panel; foreign-carrier devices are a tiny, unrepresentative fraction, so nationality cannot be read reliably.', 'これは国内居住者パネルで、海外キャリアのデバイスはごく一部かつ非代表的なため、国籍は確実に判別できません。'),
              needs: L('An inbound-roaming or passport-linked data source matched by nationality.', '国籍で照合可能な、インバウンドローミングまたはパスポート連携のデータソース。') },
          ]} />
      </GlassPanel>
    </div>
  )
}
