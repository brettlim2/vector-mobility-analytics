import { useState } from 'react'
import type { RetailVenue } from '../lib/types'
import { GlassPanel, SectionHeader, SubLabel, KpiTile, AnswerCard, Badge, BarRow, FlowMatrix, StackedShare, FeasibilityTable, SectionNav, Empty, Legend } from '../components/ui'
import { TrendChart, LagBars, PairedBars, ForestPlot, Dumbbell, FloorMap } from '../components/charts'
import { StoryBoard, RangeStrip, HopStrip, TwoBars } from '../components/story'
import { TEAL, TEAL_LT, VOLT, MIST, WIRE, CAT } from '../lib/palette'
import { fmtDate, fmtInt, fmtSigned, fmtYen } from '../lib/format'
import { makeL, tx, type Locale } from '../lib/i18n'

// Copy rule for this page: say what happened in the client's words first, then the number.
// "zone" = a retail area the location data can tell apart; "detectable change" = the noise floor (MDE).
export function RetailDashboard({ v, locale = 'en' }: { v: RetailVenue | undefined; locale?: Locale }) {
  const [metric, setMetric] = useState<'share' | 'devices'>('share')
  const L = makeL(locale)
  if (!v) return <Empty note={L('The retail readout has not loaded.', '小売レポートを読み込めませんでした。')} />

  const dates = Object.keys(v.daily).sort()
  const zone = (id: string) => tx(v.zones.find((z) => z.zone === id)?.label, locale)
  const promo = v.normalization.promoted, neigh = v.normalization.neighbour, ctrl = v.normalization.control
  const att = v.attribution
  const lag = v.best_lag
  const yen = (n: number) => fmtYen(n, locale)
  const pct2 = (n: number) => `${n.toFixed(2)}%`
  const postsByDay = Object.fromEntries(dates.map((d) => [d, v.daily[d].posts]))
  const series = dates.map((d) => ({ date: d, value: metric === 'share' ? v.daily[d].promoted_share_pct : v.daily[d].promoted_visitors }))
  const campaignLabel = `${fmtDate(v.window.during[0], locale)}–${fmtDate(v.window.during[v.window.during.length - 1], locale).replace(/^\D+\s|^\d+\//, '')}`
  // duty-free style zones: sales ride on a few large purchases, so visit counts do not explain them
  const weak = v.zones.filter((z) => z.daily_visit_revenue_r < 0.3)
  const linked = v.zones.filter((z) => z.daily_visit_revenue_r >= 0.3)
  const range = (xs: number[]) => `${Math.min(...xs).toFixed(2)}${L(' to ', '〜')}${Math.max(...xs).toFixed(2)}`
  const adjRange = range(linked.map((z) => z.daily_visit_revenue_r_adjusted))
  const weakNames = weak.map((z) => tx(z.label, locale)).join(L(', ', '、'))
  const next = v.promoted_next_stops.find((n) => n.zone === v.neighbour_zone) ?? v.promoted_next_stops[0]
  const secShare = att.secondary.modelled_revenue / (att.primary.modelled_revenue + att.secondary.modelled_revenue)
  const liftLo = promo.relative_pct - promo.mde_relative_pct, liftHi = promo.relative_pct + promo.mde_relative_pct
  const spill = att.secondary.incremental_visits_from_promoted ?? 0
  const tBase = Math.round(att.transition_per_day.baseline), tCamp = Math.round(att.transition_per_day.campaign)
  const modelVsReported = Math.round((att.primary.modelled_revenue / Math.max(1, att.primary.reported_revenue_uplift)) * 100)
  const quietStores = v.stores.filter((x) => !x.promoted && !x.neighbour && !weak.some((z) => z.zone === x.zone))
  const quietMax = Math.ceil(Math.max(...quietStores.map((x) => Math.abs(x.traffic_adjusted_change_pct))))
  const about = (n: number) => Math.round(n)
  const totalVisits = v.zones.reduce((a, z) => a + z.visitors, 0), totalSales = v.zones.reduce((a, z) => a + z.reported_revenue, 0)
  const df = weak[0] ?? v.zones[v.zones.length - 1]
  const dfVisits = Math.round((df.visitors / totalVisits) * 100), dfSales = Math.round((df.reported_revenue / totalSales) * 100)
  // same figure as the headline for the three zones measured above, so the table never disagrees with it
  const zoneChange = (id: string) => {
    if (id === v.promoted_zone) return promo.relative_pct
    if (id === v.neighbour_zone) return neigh.relative_pct
    if (id === v.control_zone) return ctrl.relative_pct
    const z = v.zones.find((x) => x.zone === id)
    return z ? (z.share_pct.campaign / z.share_pct.baseline - 1) * 100 : 0
  }
  const P = zone(v.promoted_zone), N = zone(v.neighbour_zone), C = zone(v.control_zone)
  const floorZone = (id: string) => {
    const ch = zoneChange(id)
    const state: 'clear' | 'small' | 'flat' = id === v.promoted_zone && promo.detected ? 'clear' : id === v.neighbour_zone ? (neigh.detected ? 'clear' : 'small') : 'flat'
    const note = id === v.promoted_zone ? L('campaign brand', '施策ブランド') : id === v.neighbour_zone ? L(`+${fmtInt(spill)} came from ${shortName(v.promoted_zone)}`, `${shortName(v.promoted_zone)}から+${fmtInt(spill)}`) : id === v.control_zone ? L('comparison', '比較用') : undefined
    return { id, label: shortName(id), change: ch, state, note }
  }
  const shortName = (id: string) => zone(id).replace(/\s*[（(].*$/, '')
  const chip = (detected: boolean) => <Badge color={detected ? VOLT : MIST}>{detected ? L('Clear change', '明確な変化') : L('Too small to call', '判定できない小ささ')}</Badge>

  const navItems = [
    { id: 'sec-verdict', label: L('Answers', '回答') },
    { id: 'sec-sns', label: L('Social (synthetic) → visits', 'SNS（合成）→ 来訪') },
    { id: 'sec-paths', label: L('Where shoppers go next', '買い回り') },
    { id: 'sec-revenue', label: L('Sales (modelled)', '売上（推計）') },
    { id: 'sec-feasibility', label: L('What we need from you', 'ご用意いただくもの') },
  ]

  return (
    <div className="flex flex-col gap-4">
      <StoryBoard
        kicker={L(`New Chitose Airport × Retail · what the data says · campaign ${campaignLabel}`, `新千歳空港 × リテール · データが示すこと · 施策 ${campaignLabel}`)}
        headline={promo.detected
          ? L(`Social media buzz brought about ${about(promo.relative_pct)}% more shoppers to the brand’s zone, and its tenants’ sales rose with it`, `SNSでの話題で、ブランドのエリアを訪れる買い物客が約${about(promo.relative_pct)}%増え、テナントの売上も伸びました`)
          : L('This campaign’s effect on visits was too small to tell apart from a normal week', '今回の施策による来訪の変化は、通常週と区別できない小ささでした')}
        sub={L(`One fashion brand, one campaign week, New Chitose Airport. The knock-on effect on the zone next door is likely, but one week is not enough to prove it.`,
               `1つのファッションブランド、1週間の施策、新千歳空港。隣のエリアへの波及は起きている可能性が高いものの、1週間では立証できません。`)}
        evidenceLabel={L('See the evidence', '根拠を見る')}
        points={[
          { figure: fmtSigned(promo.relative_pct, 0), href: '#sec-sns',
            claim: L('more shoppers in the brand’s zone during campaign week', '施策週、ブランドのエリアを訪れた買い物客の増加'),
            visual: <RangeStrip value={promo.relative_pct} mde={promo.mde_relative_pct} rangeLabel={L('normal variation', '通常の変動幅')} valueLabel={L('campaign week', '施策週')} />,
            soWhat: L(`Visits rose about ${lag.lag_days} day after posts did. Changes beyond ±${about(promo.mde_relative_pct)}% stand out from a normal week, so the real lift is between ${fmtSigned(liftLo, 0)} and ${fmtSigned(liftHi, 0)}.`,
                      `来訪は投稿の約${lag.lag_days}日後に増えました。±${about(promo.mde_relative_pct)}%を超える変化は通常週と区別できるため、実際の伸びは${fmtSigned(liftLo, 0)}〜${fmtSigned(liftHi, 0)}です。`) },
          { figure: yen(att.primary.reported_revenue_uplift), href: '#sec-revenue',
            claim: L('extra sales reported by the zone’s tenants that week', '同エリアのテナントが報告した施策週の売上増'),
            visual: <TwoBars format={yen} rows={[{ label: L('reported by tenants', 'テナント報告'), value: att.primary.reported_revenue_uplift, strong: true }, { label: L('estimated from extra visits', '来訪増からの推計'), value: att.primary.modelled_revenue }]} />,
            soWhat: L('Movement data and the tills agree on direction and rough size. Location data shows visits, not purchases, so sales always come from your figures.',
                      '人の動きと売上は、方向とおおよその規模で一致しています。位置情報で分かるのは来訪であり購入ではないため、売上は常に貴社の数値を用います。') },
          { figure: `+${fmtInt(spill)}`, href: '#sec-paths',
            claim: L(`extra shoppers went on next door to ${shortName(v.neighbour_zone)}`, `${shortName(v.neighbour_zone)}へ移動した買い物客の上積み`),
            visual: <HopStrip from={shortName(v.promoted_zone)} to={shortName(v.neighbour_zone)} moves={`+${fmtInt(spill)}`} toChange={neigh.relative_pct} toNote={neigh.detected ? L('clear change', '明確な変化') : L('too small to call', '判定できない小ささ')} />,
            soWhat: L(`A knock-on effect worth about ${yen(att.secondary.modelled_revenue)} is likely, but too small to prove in one week. Measuring three or four campaigns together settles it.`,
                      `約${yen(att.secondary.modelled_revenue)}の波及効果がある可能性は高いものの、1週間では立証できません。3〜4回の施策をまとめて測れば判定できます。`) },
        ]}
        nextTitle={L('What we would do next', '次のステップ')}
        next={[
          L('Share daily sales per tenant, so every result is in yen, not just visits.', 'テナント別の日次売上をご共有いただき、来訪だけでなく金額で評価します。'),
          L('Measure the next three campaigns together to settle the knock-on effect.', '次の3回の施策をまとめて測り、波及効果を判定します。'),
          L('If shop-to-shop matters (Zara → Mango), add in-terminal Wi-Fi or beacon data.', '店舗間（Zara → Mango）が重要であれば、館内Wi-Fi・ビーコンのデータを追加します。'),
        ]} />

      {v.data_provenance && (
        <div className="rounded-[var(--mn-radius-sm)] border border-[var(--mn-wire)] bg-[color-mix(in_srgb,var(--mn-ink)_4%,transparent)] px-4 py-2.5 text-[12.5px] leading-relaxed text-[var(--mn-mist)]">
          <span className="font-semibold text-[var(--mn-heading)]">{L('What is real here: ', 'このページの実データ：')}</span>
          {L('terminal footfall, dwell and movement between terminal areas are real, from the Factori Japan airport panel. Zone-to-tenant labels are illustrative (GPS resolves terminal areas, not individual shops). Revenue is modelled from visits × assumed per-visit spend. The social-media series is synthetic. The real, measured signal this week is the +',
             'ターミナルの来訪・滞在・エリア間の移動は、Factori日本の空港パネルによる実データです。エリアと店舗の対応は例示です（GPSはエリア単位で、個別店舗までは判別しません）。売上は来訪×想定客単価による推計です。SNSの系列は合成データです。今週の実測シグナルは+')}
          {v.silver_week_uplift_pct}%{L(' Silver Week terminal uplift.', 'のシルバーウィークのターミナル来訪増です。')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <KpiTile label={L('Posts about the brand (synthetic)', 'ブランド関連投稿（合成）')} value={fmtInt(v.social.campaign_posts)}
          sub={L(`in campaign week · ${fmtInt(v.social.posts)} over ${v.window.days} days`, `施策週 · ${v.window.days}日間で${fmtInt(v.social.posts)}件`)} />
        <KpiTile label={L('Terminal visitors who stop at a shop', '店舗に立ち寄る来訪者の割合')} value={`${Math.round(v.retail_conversion * 100)}%`}
          sub={L(`${v.zones_per_session.toFixed(1)} zones visited on average`, `平均${v.zones_per_session.toFixed(1)}エリアを訪問`)} />
        <KpiTile label={L('Silver Week', 'シルバーウィーク')} value={`+${v.silver_week_uplift_pct}%`}
          sub={L('busier terminal; results allow for it', 'ターミナルの混雑増。結果はこれを織り込み済み')} />
        <KpiTile label={L('Phones in our sample', 'サンプル内のスマートフォン')} value={L(`${fmtInt(v.terminal_devices_per_day)}/day`, `${fmtInt(v.terminal_devices_per_day)}台／日`)}
          sub={L('in the terminal · assumed for this example', 'ターミナル内 · 本例での仮定')} />
      </div>

      <SectionNav items={navItems} label={L('Sections', 'セクション')} />

      <GlassPanel id="sec-verdict" className="p-5 scroll-mt-28">
        <SectionHeader kicker={L('Answers', '回答')} title={L('Your three questions', 'いただいた3つのご質問')} />
        <div className="grid gap-3 lg:grid-cols-3">
          <AnswerCard q={L('Can we measure the impact of social media engagement on foot traffic and retail revenue?', 'SNSでのブランド話題が、来訪と小売売上に与える影響を測れますか？')}
            badge={promo.detected ? L('Yes', 'はい') : L('Not this time', '今回は判定不可')} badgeColor={promo.detected ? VOLT : MIST}
            answer={promo.detected
              ? L(`Yes. Visits to the promoted zone rose about ${about(promo.relative_pct)}% during the campaign.`, `はい。施策期間中、施策エリアへの来訪は約${about(promo.relative_pct)}%増えました。`)
              : L(`Not from this campaign. The change (${fmtSigned(promo.relative_pct)}) is too small to tell apart from a normal week.`, `今回の施策では判定できません。変化（${fmtSigned(promo.relative_pct)}）が通常週の変動と区別できない小ささです。`)}>
            {L(`With this sample we can reliably see changes larger than ±${promo.mde_relative_pct}%, so the real figure is probably between ${fmtSigned(liftLo, 0)} and ${fmtSigned(liftHi, 0)}. A zone with no campaign, ${C}, stayed flat at ${fmtSigned(ctrl.relative_pct)}. Visits rose about ${lag.lag_days} day after posts did. On sales: tenants in that zone reported ${yen(att.primary.reported_revenue_uplift)} more than a normal week. This is a before-and-after comparison with a comparison zone, not a controlled experiment.`,
               `このサンプルで確実に捉えられるのは±${promo.mde_relative_pct}%を超える変化のため、実際の値は${fmtSigned(liftLo, 0)}〜${fmtSigned(liftHi, 0)}の範囲と考えられます。施策のないエリア「${C}」は${fmtSigned(ctrl.relative_pct)}で横ばいでした。来訪は投稿の約${lag.lag_days}日後に増えています。売上面では、同エリアのテナント報告売上が通常週を${yen(att.primary.reported_revenue_uplift)}上回りました。比較エリアを置いた前後比較であり、統制された実験ではありません。`)}
          </AnswerCard>
          <AnswerCard q={L('Can we track primary and secondary revenue contribution? (A visitor goes to Zara for a promotion, then on to Mango.)', '一次・二次の売上貢献を追えますか？（例：販促でZaraを訪れ、その後Mangoへ）')}
            badge={neigh.detected ? L('Yes, between zones', 'エリア間なら可') : L('Partly', '一部可')} badgeColor={TEAL_LT}
            answer={neigh.detected
              ? L('Yes, between zones. We can see shoppers move from the promoted zone to the one next door, and that zone gained too.', 'エリア間であれば可能です。施策エリアから隣のエリアへ移動する買い物客を捉えられ、隣のエリアも伸びました。')
              : L('Partly. We can see shoppers move on to the next zone, but one campaign week is too short to prove the extra sales.', '一部可能です。隣のエリアへ移動する買い物客は捉えられますが、施策1週間では売上の上積みを立証できません。')}>
            {L(`Moves from ${P} to ${N} went from ${tBase} to ${tCamp} a day, ${fmtInt(spill)} extra over the week. That would be worth about ${yen(att.secondary.modelled_revenue)} in follow-on sales, next to ${yen(att.primary.modelled_revenue)} in the promoted zone. ${neigh.detected ? '' : `But the next-door zone's own rise (${fmtSigned(neigh.relative_pct)}) is smaller than the ±${neigh.mde_relative_pct}% we can reliably see; measuring several campaigns together would settle it. `}Two shops side by side in the same zone, like Zara and Mango, cannot be told apart from phone location alone. That needs in-store Wi-Fi, beacons or receipt data.`,
               `${P}から${N}への移動は1日${tBase}件から${tCamp}件に増え、週合計で${fmtInt(spill)}件の上積みでした。波及売上に換算すると約${yen(att.secondary.modelled_revenue)}（施策エリアは${yen(att.primary.modelled_revenue)}）です。${neigh.detected ? '' : `ただし隣のエリア自体の伸び（${fmtSigned(neigh.relative_pct)}）は、確実に捉えられる±${neigh.mde_relative_pct}%より小さく、複数の施策をまとめて測れば判定できます。`}ZaraとMangoのように同じエリア内で隣り合う店舗は、スマートフォンの位置情報だけでは区別できません。店内Wi-Fi・ビーコン・レシートデータが必要です。`)}
          </AnswerCard>
          <AnswerCard q={L('If not, can we at least track movement in the facility and correlate it with each store’s reported revenue?', '難しい場合、館内の動きを追い、各店舗の報告売上と相関させることはできますか？')}
            badge={L('Yes, by zone', 'エリア単位で可')} badgeColor={VOLT}
            answer={L('Yes, zone by zone. Each store is matched to the zone it sits in.', 'はい、エリア単位で可能です。各店舗は所在エリアに紐づけて見ます。')}>
            {L(`Zones with more visits report more sales: the match is very close (${v.cross_zone_visit_revenue_r_ex_dutyfree.toFixed(2)} on a scale where 1 is a perfect match, leaving out duty-free). Day by day the match is looser (${adjRange} once busy days are allowed for), so weekly totals are the right unit to judge a store on. ${weakNames} does not follow visit counts at all: a few large purchases decide its sales.`,
               `来訪の多いエリアほど報告売上も多く、両者はよく一致します（1が完全一致の尺度で${v.cross_zone_visit_revenue_r_ex_dutyfree.toFixed(2)}、免税店を除く）。日ごとに見ると一致は緩く（混雑の影響を除くと${adjRange}）、店舗の評価には週次の合計が適しています。${weakNames}は来訪数と連動せず、少数の高額購入が売上を左右します。`)}
          </AnswerCard>
        </div>
      </GlassPanel>

      <div id="sec-sns" className="grid lg:grid-cols-3 gap-4 scroll-mt-28">
        <GlassPanel className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-x-3">
            <SectionHeader kicker={L('Visits before, during and after', '施策前・中・後の来訪')}
              title={L('Did the campaign bring more people to the promoted zone?', '施策で施策エリアへの来訪は増えたか')} />
            <div className="mb-3 flex shrink-0 rounded-[var(--mn-radius)] border border-[var(--mn-wire)] overflow-hidden text-[12px]" role="group" aria-label={L('Chart measure', 'グラフの指標')}>
              {(['share', 'devices'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMetric(m)} aria-pressed={metric === m} className="px-2.5 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--mn-volt)]"
                  style={{ background: metric === m ? 'var(--mn-callout-bg)' : 'transparent', color: metric === m ? 'var(--mn-heading)' : 'var(--mn-mist)' }}>
                  {m === 'share' ? L('% of terminal visitors', 'ターミナル来訪者比') : L('Number of phones', '端末数')}
                </button>
              ))}
            </div>
          </div>
          <TrendChart series={series} during={v.window.during} tail={v.window.tail} dayTags={v.day_tags} postsByDay={postsByDay} locale={locale}
            baseline={metric === 'share' ? promo.baseline_share_pct : undefined}
            range={metric === 'share' ? [promo.baseline_share_pct * (1 - promo.mde_relative_pct / 100), promo.baseline_share_pct * (1 + promo.mde_relative_pct / 100)] : undefined}
            campaignAvg={metric === 'share' ? { value: promo.during_share_pct, label: L(`campaign week ${pct2(promo.during_share_pct)} (${fmtSigned(promo.relative_pct, 0)})`, `施策週 ${pct2(promo.during_share_pct)}（${fmtSigned(promo.relative_pct, 0)}）`) } : undefined}
            format={metric === 'share' ? (n) => `${n.toFixed(1)}%` : fmtInt}
            windowLabel={L('Campaign', '施策')}
            caption={metric === 'share'
              ? L(`${P}: ${pct2(promo.baseline_share_pct)} of terminal visitors before the campaign, ${pct2(promo.during_share_pct)} during it. Silver Week barely shows, because this view already allows for how busy the terminal was.`,
                  `${P}：施策前はターミナル来訪者の${pct2(promo.baseline_share_pct)}、施策中は${pct2(promo.during_share_pct)}。この表示はターミナルの混雑を織り込んでいるため、シルバーウィークの影響はほとんど現れません。`)
              : L('Counted as phones, there are two peaks: the campaign and Silver Week. Only the first is the brand’s doing, which is why the percentage view is the one to read.',
                  '端末数で見ると、施策とシルバーウィークの2つの山があります。ブランド施策によるものは前者だけで、割合表示で読むべき理由です。')} />
        </GlassPanel>
        <GlassPanel className="p-5">
          <SectionHeader kicker={L('Timing', 'タイミング')} title={L('How soon do visits follow posts?', '投稿から来訪まで何日か')}
            sub={L('How closely daily visits track daily posts, if we assume visits come the same day or 1 to 4 days later. Taller = closer match.', '来訪が投稿の当日、または1〜4日後に起きると仮定したとき、日々の来訪と投稿がどれだけ連動するか。棒が高いほど連動が強い。')} />
          <LagBars items={v.lag_correlation} best={lag.lag_days} locale={locale} />
          <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--mn-mist)]">
            {L(`The closest match is ${lag.lag_days} day later, but the neighbouring bars are nearly as tall. With one campaign, read this as "within a day or two", not a precise delay.`,
               `最も連動が強いのは${lag.lag_days}日後ですが、隣の棒もほぼ同じ高さです。施策1回分のため、「1〜2日以内」と読むのが妥当で、正確な日数ではありません。`)}
          </p>
        </GlassPanel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <GlassPanel className="p-5">
          <SectionHeader kicker={L('Is the change real?', 'この変化は本物か')} title={L('Three zones side by side', '3つのエリアを並べて確認')}
            sub={L(`Campaign week compared with the ${v.window.baseline.length} days before it.`, `施策週と、その前の${v.window.baseline.length}日間を比較。`)} />
          <ForestPlot locale={locale} rows={[
            { label: P, role: L('where the campaign brand is', '施策ブランドがあるエリア'), value: promo.relative_pct, mde: promo.mde_relative_pct, detected: promo.detected, badge: chip(promo.detected) },
            { label: N, role: L('next door · could benefit indirectly', '隣のエリア · 波及の可能性'), value: neigh.relative_pct, mde: neigh.mde_relative_pct, detected: neigh.detected, badge: chip(neigh.detected) },
            { label: C, role: L('comparison zone · no campaign', '比較エリア · 施策なし'), value: ctrl.relative_pct, mde: ctrl.mde_relative_pct, detected: ctrl.detected, badge: chip(ctrl.detected) },
          ]} />
          <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--mn-mist)]">
            {L(`Each dot is the change in campaign week; the bar either side is how far it could be off. If the bar clears the zero line, the change is real. Set against the comparison zone, the promoted zone gained ${fmtSigned(v.diff_in_diff_relative_pct)}.`,
               `点は施策週の変化、左右の線は誤差の幅です。線が0の縦線をまたがなければ、本物の変化と言えます。比較エリアとの差で見ると、施策エリアは${fmtSigned(v.diff_in_diff_relative_pct)}伸びました。`)}
          </p>
        </GlassPanel>
        <GlassPanel className="p-5">
          <SectionHeader kicker={L('What people posted', '投稿の内容')} title={L('The conversation about the brand at the airport', '空港でのブランドに関する会話')}
            sub={L(`${fmtInt(v.social.posts)} posts that mention both the brand and the airport, with ${fmtInt(v.social.engagement)} likes, comments and shares.`,
                   `ブランドと空港の両方に触れた投稿${fmtInt(v.social.posts)}件、いいね・コメント・シェアは計${fmtInt(v.social.engagement)}件。`)} />
          <SubLabel>{L('What the posts were about', '投稿の話題')}</SubLabel>
          <BarRow items={v.social.topics.map((t) => ({ label: tx(t.topic, locale), value: t.posts }))} />
          <SubLabel className="mt-4">{L('Language', '言語')}</SubLabel>
          <StackedShare parts={[
            { label: L('Japanese', '日本語'), value: v.social.language_mix.ja, color: CAT[0] },
            { label: L('Chinese', '中国語'), value: v.social.language_mix.zh, color: CAT[1] },
            { label: L('English', '英語'), value: v.social.language_mix.en, color: CAT[2] },
            { label: L('Korean', '韓国語'), value: v.social.language_mix.ko, color: CAT[3] },
          ]} />
          <SubLabel className="mt-4">{L('Who posted', '投稿者')}</SubLabel>
          <StackedShare parts={[
            { label: L('Visitors and fans', '来訪者・ファン'), value: v.social.voice_mix.visitor_fan, color: CAT[0] },
            { label: L('The brand itself', 'ブランド公式'), value: v.social.voice_mix.official, color: CAT[1] },
            { label: L('Press and creators', 'メディア・クリエイター'), value: v.social.voice_mix.press_creator, color: CAT[3] },
          ]} />
        </GlassPanel>
      </div>

      <GlassPanel id="sec-paths" className="p-5 scroll-mt-28">
        <SectionHeader kicker={L('Where shoppers go', '買い物客の動き')} title={L('The terminal in campaign week: which zones moved', '施策週のターミナル：変化したエリア')}
          sub={L('Change in each zone’s share of terminal visitors, campaign week against a normal week.', '各エリアのターミナル来訪者比の変化（施策週と通常週の比較）。')} />
        <FloorMap locale={locale} floors={[
          { floor: '3F', zones: ['ramen', 'sweets', 'restaurants'].map((id) => floorZone(id)) },
          { floor: '2F', zones: ['fashion', 'lifestyle', 'confectionery', 'market'].map((id) => floorZone(id)) },
          { floor: L('Intl.', '国際線'), zones: ['dutyfree'].map((id) => floorZone(id)) },
        ]} />
      </GlassPanel>

      <div className="grid lg:grid-cols-3 gap-4">
        <GlassPanel className="p-5">
          <SectionHeader kicker={L('First stop → next stop', '最初の立ち寄り → 次の立ち寄り')} title={L('After the promoted zone, where next?', '施策エリアの次はどこへ？')}
            sub={L('Out of every 100 shoppers who started in the promoted zone, how many went on to each zone.', '施策エリアから買い物を始めた100人のうち、各エリアへ進んだ人数。')} />
          <PairedBars rows={v.promoted_next_stops.map((s) => ({ label: zone(s.zone), a: s.baseline, b: s.campaign }))}
            aLabel={L('before the campaign', '施策前')} bLabel={L('campaign week', '施策週')} format={(n) => n.toFixed(0)} hot={N} />
          <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--mn-mist)]">
            {L(`About the same share moved on next door (${about(next.baseline)} → ${about(next.campaign)} in 100). So any knock-on benefit comes from more people starting in the promoted zone, not from each shopper going further.`,
               `隣のエリアへ進む割合はほぼ同じです（100人中${about(next.baseline)}人 → ${about(next.campaign)}人）。波及効果があるとすれば、施策エリアから買い物を始める人が増えたためで、一人ひとりの回遊が広がったわけではありません。`)}
          </p>
        </GlassPanel>
        <GlassPanel className="p-5">
          <SectionHeader kicker={L('Movement inside the terminal', 'ターミナル内の動き')} title={L('Most common moves between zones', 'エリア間の主な移動')}
            sub={L(`One stop followed by another on the same visit, over ${v.window.days} days.`, `同じ来訪中に続けて立ち寄った組み合わせ（${v.window.days}日間）。`)} />
          <FlowMatrix hot={`${v.promoted_zone}>${v.neighbour_zone}`}
            items={v.zone_transitions.slice(0, 10).map((t) => ({ from: zone(t.from), to: zone(t.to), n: t.n, key: `${t.from}>${t.to}` }))} />
        </GlassPanel>
        <GlassPanel className="p-5">
          <SectionHeader kicker={L('The role each zone plays', '各エリアの役割')} title={L('Destination, or a stop along the way?', '目的地か、ついで寄りか')}
            sub={L('How often each zone is the first place a shopper goes.', '各エリアが、買い物客の最初の立ち寄り先である割合。')} />
          <div className="flex flex-col gap-1.5">
            {[...v.zones].sort((a, b) => b.primary_share - a.primary_share).map((z) => (
              <div key={z.zone} className="flex items-center gap-2 text-[13.5px]">
                <div className="w-[44%] shrink-0 leading-tight text-[var(--mn-body)]" title={tx(z.label, locale)}>{tx(z.label, locale)}</div>
                <div className="flex h-[12px] flex-1 overflow-hidden rounded-[3px]" style={{ background: WIRE }}>
                  <div style={{ width: `${z.primary_share * 100}%`, background: TEAL }} />
                </div>
                <div className="w-[38px] shrink-0 text-right font-mono text-[var(--mn-ice)]">{Math.round(z.primary_share * 100)}%</div>
              </div>
            ))}
          </div>
          <Legend items={[{ label: L('first stop', '最初の立ち寄り'), color: TEAL }, { label: L('reached after another zone', '他エリアの後に立ち寄り'), color: WIRE }]} />
        </GlassPanel>
      </div>

      <div id="sec-revenue" className="grid lg:grid-cols-2 gap-4 scroll-mt-28">
        <GlassPanel className="p-5">
          <SectionHeader kicker={L('Sales from the campaign', '施策による売上')} title={L('Promoted zone and the zone next door', '施策エリアと隣のエリア')}
            sub={L('Two ways of sizing the extra sales: what the extra visits should be worth, and what tenants actually reported above a normal week.',
                   '売上の上積みを2通りで見ます。来訪の増加分から見込まれる金額と、テナントが実際に報告した通常週との差額です。')} />
          <Dumbbell format={yen} aLabel={L('estimated from extra visits', '来訪増からの推計')} bLabel={L('reported by tenants', 'テナント報告')}
            rows={[
              { label: L(`Direct · ${P}`, `直接 · ${P}`), a: att.primary.modelled_revenue, b: att.primary.reported_revenue_uplift },
              { label: L(`Follow-on · ${N}`, `波及 · ${N}`), a: att.secondary.modelled_revenue, b: att.secondary.reported_revenue_uplift },
            ]} />
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <KpiTile label={L('Extra visits', '来訪の上積み')} value={`+${fmtInt(att.primary.incremental_visits)}`} sub={L('to the promoted zone', '施策エリア')} />
            <KpiTile label={L('Went on next door', '隣のエリアへ移動')} value={`+${fmtInt(spill)}`} sub={L('extra over the week', '週合計の上積み')} />
            <KpiTile label={L('Follow-on share', '波及の割合')} value={`${Math.round(secShare * 100)}%`} sub={L('of estimated extra sales', '推計売上増に占める割合')} />
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--mn-mist)]">
            {L(`Counts are phones in our sample over ${att.campaign_days} campaign days. For the promoted zone the estimate is ${modelVsReported}% of what tenants reported: the two agree on direction and rough size, not to the yen. ${neigh.detected ? '' : 'For the zone next door the rise in visits is too small to confirm, so read its figures as "what it could be worth", not a result.'}`,
               `件数は施策${att.campaign_days}日間のサンプル内スマートフォン数です。施策エリアの推計はテナント報告の${modelVsReported}%で、方向とおおよその規模は一致しますが、金額までは一致しません。${neigh.detected ? '' : '隣のエリアは来訪の伸びが小さく確認できないため、数値は結果ではなく「見込み額」としてお読みください。'}`)}
          </p>
        </GlassPanel>
        <GlassPanel className="p-5">
          <SectionHeader kicker={L('Movement and reported sales', '人の動きと報告売上')} title={L('Do busier zones sell more?', '来訪が多いエリアほど売れているか')}
            sub={L(`Each zone's share of all shop visits we observed, next to its share of all sales tenants reported, over ${v.window.days} days.`, `${v.window.days}日間に観測した店舗来訪全体に占める各エリアの割合と、テナント報告売上全体に占める割合。`)} />
          <PairedBars join={L('vs', '対')} format={(n) => `${n.toFixed(0)}%`} hot={P}
            aLabel={L('share of visits', '来訪の割合')} bLabel={L('share of reported sales', '報告売上の割合')}
            rows={[...v.zones].sort((a, b) => b.visitors - a.visitors).map((z) => ({ label: tx(z.label, locale), a: (z.visitors / totalVisits) * 100, b: (z.reported_revenue / totalSales) * 100 }))} />
          <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--mn-mist)]">
            {L(`Yes: the two bars are close for most zones. Where the lower bar is longer, the zone earns more per visit than average; where it is shorter, less. ${weakNames} is the clear exception, with ${dfVisits}% of visits and ${dfSales}% of sales, because a few large purchases drive it.`,
               `はい。ほとんどのエリアで2本の棒はほぼ同じ長さです。下の棒が長いエリアは来訪あたりの売上が平均より高く、短いエリアは低いことを示します。明確な例外は${weakNames}で、来訪の${dfVisits}%に対し売上の${dfSales}%を占めます。少数の高額購入が中心のためです。`)}
          </p>
        </GlassPanel>
      </div>

      <GlassPanel className="p-5">
        <SectionHeader kicker={L('Store by store', '店舗別')} title={L('Each store’s reported sales, next to the movement in its zone', '各店舗の報告売上と、所在エリアの人の動き')}
          sub={L('Sales come from you, per tenant. Movement is measured per zone, so stores in the same zone share the same movement figure.',
                 '売上はテナント別にご提供いただく数値です。人の動きはエリア単位で測るため、同じエリアの店舗は同じ値になります。')} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="text-[12px] text-[var(--mn-mist)]">
                {[L('Store', '店舗'), L('Zone', 'エリア'), L(`Reported sales, ${v.window.days} days`, `報告売上（${v.window.days}日間）`), L('Visits to its zone, campaign week vs normal', '所在エリアの来訪（施策週・通常比）'), L('Its sales, campaign week vs normal', '店舗売上（施策週・通常比）')].map((h, i) => (
                  <th key={h} className={`border-b border-[var(--mn-wire)] px-2 py-1.5 font-normal ${i >= 2 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.stores.map((s) => {
                const flagged = s.promoted || s.neighbour
                return (
                  <tr key={s.store}>
                    <td className="border-b border-[var(--mn-wire-subtle)] px-2 py-1.5" style={{ color: flagged ? 'var(--mn-heading)' : 'var(--mn-body)', fontWeight: flagged ? 600 : 400 }}>
                      {tx(s.label, locale)}
                    </td>
                    <td className="border-b border-[var(--mn-wire-subtle)] px-2 py-1.5 text-[var(--mn-mist)]">{zone(s.zone)}</td>
                    <td className="border-b border-[var(--mn-wire-subtle)] px-2 py-1.5 text-right font-mono text-[var(--mn-ice)]">{yen(s.reported_revenue)}</td>
                    <td className="border-b border-[var(--mn-wire-subtle)] px-2 py-1.5 text-right font-mono" style={{ color: flagged ? 'var(--mn-ice)' : 'var(--mn-mist)' }}>{fmtSigned(zoneChange(s.zone))}</td>
                    <td className="border-b border-[var(--mn-wire-subtle)] px-2 py-1.5 text-right font-mono" style={{ color: flagged ? 'var(--mn-teal)' : 'var(--mn-mist)', fontWeight: flagged ? 600 : 400 }}>{fmtSigned(s.traffic_adjusted_change_pct)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--mn-mist)]">
          {L(`Both change columns allow for how busy the terminal was. Read across a row: where visits to the zone rose, did the store's sales rise too? Stores with no campaign moved by up to about ±${quietMax}%, which is ordinary week-to-week variation and the yardstick for the two highlighted rows. Duty-free swings far more because a few purchases decide it.`,
             `2つの変化率はいずれもターミナルの混雑を織り込んだ値です。行を横に読み、エリアの来訪が増えたときに店舗売上も増えたかをご確認ください。施策のない店舗の変動は最大で約±${quietMax}%で、これが通常の週ごとの変動幅であり、強調表示した2行を読む目安になります。免税店は少数の購入で売上が決まるため、大きく振れます。`)}
        </p>
      </GlassPanel>

      <GlassPanel id="sec-feasibility" className="p-5 scroll-mt-28">
        <SectionHeader kicker={L('What we need from you', 'ご用意いただくもの')} title={L('What we can answer today, and what it takes', '現時点でお答えできること、そのために必要なもの')} />
        <FeasibilityTable head={[L('Your question', 'ご質問'), L('Can we answer it?', '回答可否'), L('How we measure it', '測り方'), L('What we need from you', 'ご用意いただくもの')]}
          rows={[
            { ask: L('Does social media attention bring more visitors?', 'SNSでの話題は来訪を増やすか'), status: 'yes', statusLabel: L('Yes', 'はい'),
              how: L('We compare a zone’s share of terminal visitors during a campaign with the weeks before, check it against a zone with no campaign, and see how soon visits follow posts.', '施策中のエリア来訪比を施策前の数週間と比べ、施策のないエリアと照合し、投稿から来訪までの日数を確認します。'),
              needs: L('Campaign dates per brand, a floor plan with zones marked, and at least four ordinary weeks to compare against.', 'ブランド別の施策日程、エリアを示したフロア図、比較用の通常週4週間以上。') },
            { ask: L('Does it bring more sales?', '売上も増えるか'), status: 'partial', statusLabel: L('With your sales data', '売上データがあれば'),
              how: L('Location data shows visits, not purchases. We read the sales effect from your tenants’ reported sales, alongside the change in visits.', '位置情報で分かるのは来訪であり、購入ではありません。売上への効果は、来訪の変化と並べてテナント報告売上から読み取ります。'),
              needs: L('Daily sales per tenant for the same period.', '同期間のテナント別・日次売上。') },
            { ask: L('Direct and follow-on sales, from one zone to another', '直接と波及の売上（エリア間）'), status: 'partial', statusLabel: L('Over several campaigns', '複数施策で'),
              how: L('We see which zone a shopper visits first and where they go next. One campaign week shows the pattern; proving the extra sales takes several campaigns measured together.', '買い物客が最初に訪れるエリアと次の行き先を捉えます。施策1週間で傾向は見えますが、売上の上積みを立証するには複数の施策をまとめて測る必要があります。'),
              needs: L('A calendar of past and planned campaigns, so results can be combined.', '結果をまとめて評価するための、過去と今後の施策カレンダー。') },
            { ask: L('Direct and follow-on sales, from one shop to its neighbour (Zara → Mango)', '直接と波及の売上（隣接店舗間：Zara → Mango）'), status: 'no', statusLabel: L('Needs extra data', '追加データが必要'),
              how: L('Phone location indoors is accurate to a zone, not a shopfront, and floors directly above each other look the same.', '屋内でのスマートフォン位置の精度はエリア単位で、店舗の間口までは分かりません。上下に重なるフロアも区別できません。'),
              needs: L('In-terminal Wi-Fi or beacon records, or receipt and loyalty data linked across tenants.', '館内Wi-Fi・ビーコンの記録、またはテナント横断のレシート・会員データ。') },
            { ask: L('How small a change can you see?', 'どの程度の変化まで捉えられるか'), status: 'partial', statusLabel: L('Depends on sample size', 'サンプル規模による'),
              how: L(`With about ${fmtInt(v.assumed_panel_devices_per_weekday)} phones a day in the terminal, a zone has to change by roughly ±${about(promo.mde_relative_pct)}% in a campaign week before we can be confident. More ordinary weeks to compare against, and repeated campaigns, narrow that.`, `ターミナル内のサンプルが1日約${fmtInt(v.assumed_panel_devices_per_weekday)}台の場合、施策1週間で確信を持てるのはエリアで概ね±${about(promo.mde_relative_pct)}%以上の変化です。比較用の通常週を増やし、施策を重ねることで、この幅は狭まります。`),
              needs: L('Nothing from you. We will confirm the real sample size at the airport; the figure here is an assumption.', '特にございません。空港での実際のサンプル規模は当方で確認します（本ページの値は仮定）。') },
            { ask: L('Movement in the terminal, matched to each store’s sales', '館内の動きと各店舗の売上の照合'), status: 'yes', statusLabel: L('Yes, by zone', 'エリア単位で可'),
              how: L('Visits and time spent per zone, set against tenant sales week by week, showing which stores earn more or less than their traffic suggests.', 'エリア別の来訪と滞在時間を週次でテナント売上と照合し、来訪の割に売上が高い・低い店舗を示します。'),
              needs: L('Which tenant sits in which zone, and daily sales.', 'テナントとエリアの対応表、日次売上。') },
          ]} />
      </GlassPanel>
    </div>
  )
}
