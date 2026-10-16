import type { JpData } from '../lib/types'
import { GlassPanel, SectionHeader, FeasibilityTable, SectionNav } from '../components/ui'
import { fmtInt, fmtSigned } from '../lib/format'
import { makeL, type Locale } from '../lib/i18n'

// Event readouts built on the real panel export (separate project: "Japan Event Readouts").
export const EVENT_READOUTS_URL = 'https://claude.ai/artifact/1LweeyyXwa1QrF58uQ7y1d'

// "Start here": what this demo is, what is real, what is assumed or made up, and what real data it needs.
// Real figures below come from the panel export behind two event dashboards. Event names stay generic, and every
// list is assembled with __ONLY__ so a standalone demo carries only its own report's material.
export function IntroPage({ data, locale = 'en', onPick }: { data: JpData | null; locale?: Locale; onPick: (t: 'retail' | 'tourism') => void }) {
  const L = makeL(locale)
  const r = data?.retail?.new_chitose
  const t = data?.tourism
  const panel = r?.assumed_panel_devices_per_weekday ?? 2000
  const cohort = t?.inbound_cohort ?? 48100
  const cls = t?.nationality.class_counts

  const reports = [
    ...(__ONLY__ !== 'tourism' ? [{ id: 'retail' as const, title: L('New Chitose Airport × Retail', '新千歳空港 × リテール'),
      q: L('Does social media buzz move shoppers and sales? Can we split direct and follow-on sales? Can movement be matched to each store’s sales?', 'SNSの話題は買い物客と売上を動かすか。直接と波及の売上を分けられるか。人の動きを各店舗の売上と照合できるか。') }] : []),
    ...(__ONLY__ !== 'retail' ? [{ id: 'tourism' as const, title: L('Airlines × Domestic tourism', '航空会社 × 国内観光'),
      q: L('Which region are domestic travellers from? Where do they go after entering a region? Can that support new routes?', '国内旅行者はどの地域から来るか。地域に入った後どこへ行くか。新規路線の検討に使えるか。') }] : []),
  ]

  const steps = [
    [L('Read the original event dashboards', '元のイベントダッシュボードを読み解く'), L('Studied two existing event dashboards and their real data: how footfall is normalised, how a noise range is set, and how canceled days are used as a natural experiment.', '既存の2つのイベントダッシュボードと実データを確認。来訪の正規化、変動幅の設定、中止日を自然実験として使う方法を把握しました。')],
    __ONLY__ === 'retail'
      ? [L('Built the report for your questions', 'ご質問に合わせてレポートを作成'), L('Same methods, pointed at New Chitose Airport. Terminal footfall and movement are real, from the Factori Japan panel; revenue is modelled from visits and the social-media series is synthetic.', '同じ手法を新千歳空港に適用しました。ターミナルの来訪と動きはFactori日本パネルの実データ、売上は来訪からの推計、SNSは合成データです。')]
      : __ONLY__ === 'tourism'
        ? [L('Built the report for your questions', 'ご質問に合わせてレポートを作成'), L('Same methods, pointed at domestic travel. Region-to-region flows are real, from the Factori Japan panel. (It is a domestic resident panel, so inbound nationality is out of scope.)', '同じ手法を国内旅行に適用しました。地域間の移動はFactori日本パネルの実データです（国内居住者パネルのため、国籍別インバウンドは対象外）。')]
        : [L('Built the two reports for your questions', 'ご質問に合わせて2つのレポートを作成'), L('Same methods, pointed at New Chitose Airport retail and at domestic travel. The mobility — terminal footfall, movement, and region-to-region flows — is real, from the Factori Japan panel. Revenue is modelled from visits and the social-media series is synthetic.', '同じ手法を新千歳空港のリテールと国内旅行に適用しました。モビリティ（ターミナル来訪、動き、地域間移動）はFactori日本パネルの実データです。売上は来訪からの推計、SNSは合成データです。')],
    __ONLY__ === 'tourism'
      ? [L('Stress-tested it', 'ストレステスト'), L('Checked that every number agrees with every other one, and that no route figure is an artefact of how the sample was built.', 'すべての数値が互いに整合し、路線に関する数値がサンプルの作り方による見かけの結果でないことを確認しました。')]
      : [L('Stress-tested it', 'ストレステスト'), L('Checked that every number agrees with every other one, ran the retail simulation 150 times to see what a single campaign can and cannot prove, and showed the typical result rather than a flattering one.', 'すべての数値が互いに整合するかを確認し、小売のシミュレーションを150回実行して1回の施策で証明できること・できないことを確かめ、都合の良い結果ではなく典型的な結果を表示しています。')],
    [L('Rewrote it for a client', 'クライアント向けに再構成'), L('Plain language in English and Japanese, the answer before the evidence, rebuilt charts, and the MessyNet Daylight look.', '英語と日本語の平易な表現、根拠より先に結論、チャートの作り直し、MessyNet Daylightのデザイン。')],
    ...(__ONLY__ ? [] : [[L('Re-presented the real event readouts', '実際のイベント分析を再構成'), L('The same improvements applied to the two real events, as a separate page that leaves the originals untouched.', '同じ改善を2つの実イベントに適用し、元のダッシュボードには手を加えず別ページとして作成しました。')]]),
  ]

  const assumptions: [string, string, string, string][] = [
    ...(__ONLY__ !== 'tourism' ? [
      [L('Phones in our sample inside the terminal', 'ターミナル内のサンプル端末数'), L(`${fmtInt(panel)} a weekday`, `平日${fmtInt(panel)}台`), L('In line with the 1,700–2,600 a day the real panel shows at large Tokyo venues.', '実パネルが東京の大型会場で示す1日1,700〜2,600台と同水準。'), L('Real count from the panel for New Chitose.', '新千歳空港の実パネル件数。')],
      [L('Normal day-to-day drift in each zone', '各エリアの日々の自然な変動'), L('6%, on top of sampling noise', '6%（サンプル誤差に加えて）'), L('A middle guess. The real events showed much wider ranges (±38% and ±65%), partly for other reasons.', '中間的な想定。実イベントではさらに広い変動幅（±38%、±65%）が見られました（他の要因も含む）。'), L('Measure it from several ordinary weeks of real data.', '実データの通常週数週間から実測。')],
      [L('Terminal visitors who shop', '店舗に立ち寄る来訪者の割合'), L(`${Math.round((r?.retail_conversion ?? 0.47) * 100)}%`, `${Math.round((r?.retail_conversion ?? 0.47) * 100)}%`), L('A placeholder that sets the scale of shop visits.', '店舗来訪の規模を決める仮の値。'), L('Real zone visits from the panel.', '実パネルのエリア来訪。')],
      [L('How much the campaign moved visits', '施策による来訪の変化'), L('About +16% to the promoted zone (the simulation’s true value)', '施策エリアで約+16%（シミュレーション上の真の値）'), L('A strong but plausible campaign, so the demo shows both what can and cannot be detected.', '強めだが現実的な施策とし、検出できること・できないことの両方を示すため。'), L('Real campaigns, measured.', '実際の施策の計測。')],
      [L('Where shoppers go next', '買い物客の次の行き先'), L('A fixed table of next-stop chances per zone', 'エリアごとの次の立ち寄り確率表'), L('Shapes the paths; not based on any real terminal.', '回遊パターンを形作る仮定。実在のターミナルに基づくものではありません。'), L('Real stop-to-stop sequences from the panel.', '実パネルの立ち寄り順序。')],
      [L('Sales per visit in each zone', 'エリア別の来訪あたり売上'), L('Set per zone; duty-free set high and weakly tied to visits', 'エリアごとに設定。免税店は高めで来訪との連動は弱く設定'), L('Places total sales around ¥26bn a year, a believable order of size for a large terminal.', '年間売上の合計を約260億円とし、大型ターミナルとして妥当な規模に。'), L('Your tenants’ daily sales.', 'テナントの日次売上。')],
      [L('Terminal layout, zones and tenants', 'ターミナルのレイアウト、エリア、テナント'), L('Eight zones over 2F, 3F and international; generic tenant names', '2F・3F・国際線の8エリア、仮のテナント名'), L('Illustrative only; not the real floor plan.', '説明用であり、実際のフロア図ではありません。'), L('Your floor plan and tenant list.', 'フロア図とテナント一覧。')],
      [L('Which simulation run is shown', '表示するシミュレーション'), L('The typical one of 150 runs', '150回のうち典型的な1回'), L('So the page shows a normal result, not a lucky one.', '偶然良い結果ではなく、通常の結果を示すため。'), L('Not needed once real data arrives.', '実データ入手後は不要。')],
    ] as [string, string, string, string][] : []),
    ...(__ONLY__ !== 'retail' ? [
      [L('Domestic travellers in the sample', 'サンプル内の国内旅行者数'), L(`${fmtInt(cohort)} over ${r?.window.days ?? 8} days (real)`, `${r?.window.days ?? 8}日間で${fmtInt(cohort)}人（実データ）`), L('Real: devices that travelled to a region away from home.', '実データ：居住地域外へ移動したデバイス。'), L('Scales up with a longer window and more of the panel.', '期間とパネル比率を広げれば増加します。')],
      [L('Trip mix (real)', '旅行の種類（実データ）'), L(`${fmtInt(cls?.overnight ?? 0)} overnight · ${fmtInt(cls?.day_trip ?? 0)} day-trip · ${fmtInt(cls?.multi_region ?? 0)} multi-region`, `宿泊 ${fmtInt(cls?.overnight ?? 0)} · 日帰り ${fmtInt(cls?.day_trip ?? 0)} · 複数地域 ${fmtInt(cls?.multi_region ?? 0)}`), L('Real: from nights and regions stayed in.', '実データ：滞在泊数と滞在地域から算出。'), L('Inbound nationality is not available from this domestic panel.', '国籍別インバウンドは本国内パネルでは取得できません。')],
      [L('Gateway → destination flows by region (real)', '地域別の玄関口→目的地の移動（実データ）'), L('Entry gateway, destinations and nights per region', '地域ごとの玄関口・目的地・滞在泊数'), L('Real: reconstructed from each traveller’s stop sequence.', '実データ：各旅行者の立ち寄り順序から再構成。'), L('A longer window to cover seasonal peaks.', '季節のピークを含む通年データ。')],
    ] as [string, string, string, string][] : []),
  ]

  const navItems = [
    { id: 'intro-did', label: L('What we did', '実施内容') },
    { id: 'intro-real', label: L('Real data today', '現在の実データ') },
    { id: 'intro-assumed', label: L('What we assumed', '仮定') },
    { id: 'intro-synthetic', label: L('What is made up', '架空の部分') },
    { id: 'intro-needed', label: L('Real data we need', '必要な実データ') },
  ]

  const bullet = (items: string[]) => (
    <ul className="flex flex-col gap-2 text-[13.5px] leading-relaxed text-[var(--mn-body)]">
      {items.map((x, i) => <li key={i} className="border-l-2 border-[var(--mn-wire)] pl-2.5">{x}</li>)}
    </ul>
  )

  return (
    <div className="flex flex-col gap-4">
      <section className="vm-glass-bright min-w-0 rounded-[var(--mn-radius-lg)] px-5 pb-5 pt-6 md:px-7">
        <div className="mn-kicker">{L('Start here · about this demo', 'はじめに · このデモについて')}</div>
        <h2 className="font-display mt-2 max-w-[980px] text-[30px] leading-[1.12] text-[var(--mn-heading)] [text-wrap:balance] md:text-[38px]">
          {__ONLY__ ? L('A sample report for your questions, built on real Factori Japan mobility. Here is what is real, what is modelled or synthetic, and the data we would need', 'ご質問に合わせたサンプルレポート（Factori日本の実モビリティに基づく）。何が実データで、何が推計・合成で、どんなデータが必要かをまとめました')
            : L('Two sample reports for your questions, built on real Factori Japan mobility. Here is what is real, what is modelled or synthetic, and the data we would need', 'ご質問に合わせた2つのサンプルレポート（Factori日本の実モビリティに基づく）。何が実データで、何が推計・合成で、どんなデータが必要かをまとめました')}<span className="mn-volt-dot" aria-hidden />
        </h2>
        <p className="mt-2 max-w-[860px] text-[15px] leading-relaxed text-[var(--mn-body)]">
          {L('The mobility is real: terminal footfall and movement at New Chitose, and region-to-region domestic travel, come from the Factori Japan panel. Revenue is modelled from visits × assumed spend, and the social-media series is synthetic — both clearly labelled where they appear.',
             'モビリティは実データです。新千歳空港のターミナル来訪・動きと、国内の地域間移動はFactori日本パネルに基づきます。売上は来訪×想定客単価による推計、SNSは合成データで、いずれも該当箇所に明示しています。')}
        </p>
        <div className={`mt-5 grid gap-3 ${reports.length > 1 ? 'md:grid-cols-2' : ''}`}>
          {reports.map((x) => (
            <button key={x.id} type="button" onClick={() => onPick(x.id)}
              className="text-left rounded-[var(--mn-radius)] border border-[var(--mn-wire)] bg-[var(--mn-abyss)] p-4 hover:border-[var(--mn-teal)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mn-volt)]">
              <div className="text-[15px] font-semibold text-[var(--mn-heading)]">{x.title}</div>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--mn-body)]">{x.q}</p>
              <div className="mt-2 text-[13px] font-semibold text-[var(--mn-teal)]">{L('Open the sample report →', 'サンプルレポートを開く →')}</div>
            </button>
          ))}
        </div>
      </section>

      <SectionNav items={navItems} label={L('Sections', 'セクション')} />

      <GlassPanel id="intro-did" className="p-5 scroll-mt-28">
        <SectionHeader kicker={L('What we did', '実施内容')} title={L('How this demo was made', 'このデモの作り方')} />
        <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {steps.map(([title, body], i) => (
            <li key={i} className="flex gap-3 rounded-[var(--mn-radius)] border border-[var(--mn-wire)] bg-[var(--mn-abyss)] p-3">
              <span className="font-mono text-[12px] text-[var(--mn-mist)]">{i + 1}</span>
              <div>
                <div className="text-[14.5px] font-semibold text-[var(--mn-heading)]">{title}</div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--mn-body)]">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </GlassPanel>

      <GlassPanel id="intro-real" className="p-5 scroll-mt-28">
        <SectionHeader kicker={L('Real data today', '現在の実データ')} title={L('What our existing data can and cannot tell you', '既存データで分かること・分からないこと')}
          sub={L('We have real location and social data for two Tokyo-area events in September 2026 (Sep 16–23). It does not cover the airport or international visitors, but it does show the methods working on real numbers.',
                 '2026年9月（16〜23日）の東京圏の2つのイベントについて、実際の位置情報とソーシャルデータがあります。空港や訪日客は対象外ですが、手法が実データで機能することを示しています。')} />
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-[14.5px] font-semibold text-[var(--mn-heading)]">{L('What it already shows', '既に分かること')}</div>
            {bullet([
              L(`The "did visits move?" method, run for real: ${fmtSigned(-2.5)} at a waterfront drone show and ${fmtSigned(-10.6)} at a games convention, both inside a wide normal range (±38% and ±65%). Neither event moved footfall detectably, and the page says so.`,
                `「来訪は動いたか」の手法を実データで適用：臨海部のドローンショーは${fmtSigned(-2.5)}、ゲームの展示会は${fmtSigned(-10.6)}で、いずれも広い変動幅（±38%、±65%）の内側。どちらのイベントも人出を検出可能な形では動かしておらず、ページでもそのように示しています。`),
              L('Canceled days as a natural experiment: at the drone show the canceled holiday nights were busier than the show nights, so the holiday, not the show, set the crowd.', '中止日を自然実験として活用：ドローンショーでは中止になった祝日の夜の方がショーの夜より混雑し、人出を決めたのはショーではなく祝日でした。'),
              L('Who came and where else they go: 86% and 91% first-time visitors, their home areas, and the other areas they visit that week.', '来訪者と他の行き先：初来訪者が86%と91%、居住エリア、同じ週に訪れた他のエリア。'),
              ...(__ONLY__ === 'retail' ? [] : [L('A first real tourism signal: Narita Airport is 6.8% of the games convention audience’s other stops that week.', '観光に関する最初の実データのシグナル：ゲームの展示会の来訪者の同じ週の他の行き先のうち、成田空港が6.8%を占めます。')]),
            ])}
            {!__ONLY__ && <><a href={EVENT_READOUTS_URL} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[13.5px] font-semibold text-[var(--mn-teal)] underline underline-offset-4">
              {L('Open the real event readouts →', '実際のイベント分析を開く →')}
            </a>
            <div className="mt-1 text-[12px] text-[var(--mn-mist)]">{L('Opens a separate page. It must be shared with you before the link works.', '別ページが開きます。共有設定がされていない場合は開けません。')}</div></>}
          </div>
          <div>
            <div className="mb-2 text-[14.5px] font-semibold text-[var(--mn-heading)]">{L('What it cannot tell you', '分からないこと')}</div>
            {bullet([
              ...(__ONLY__ === 'tourism' ? [] : [L('Anything about New Chitose Airport: there is no data from Hokkaido or from inside a terminal.', '新千歳空港に関すること全般：北海道やターミナル内のデータはありません。'),
              L('Sales: location data shows visits, never purchases. Sales always have to come from the airport.', '売上：位置情報で分かるのは来訪であり、購入ではありません。売上は常に空港からご提供いただく必要があります。')]),
              ...(__ONLY__ === 'retail' ? [] : [
              L('Visitors’ home countries and their trips across Japan: the event data has no SIM-country or itinerary output.', '旅行者の出身国・地域と国内の旅程：イベントデータにはSIM国番号や旅程の出力がありません。')]),
              L('Change over weeks or seasons: it covers 8 days, while a before-and-after needs several ordinary weeks and route planning needs a full year.', '週や季節をまたぐ変化：対象は8日間で、前後比較には通常週数週間、路線検討には通年が必要です。'),
            ])}
          </div>
        </div>
      </GlassPanel>

      <GlassPanel id="intro-assumed" className="p-5 scroll-mt-28">
        <SectionHeader kicker={L('What we assumed', '仮定')} title={L('Every assumption behind the sample numbers', 'サンプル数値の背後にある仮定')}
          sub={L('Change any of these and the sample figures change. Each one is replaced by real data in a live engagement.', 'いずれかを変えるとサンプル数値も変わります。実際のプロジェクトでは、すべて実データに置き換わります。')} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="text-[12px] text-[var(--mn-mist)]">
                {[L('Assumption', '仮定'), L('Value in this demo', '本デモでの値'), L('Why', '理由'), L('Replaced by', '置き換え先')].map((h) => <th key={h} className="border-b border-[var(--mn-wire)] px-2 py-1.5 font-normal">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {assumptions.map(([a, v, why, rep], i) => (
                <tr key={i} className="align-top">
                  <td className="w-[22%] border-b border-[var(--mn-wire-subtle)] px-2 py-2 font-semibold text-[var(--mn-heading)]">{a}</td>
                  <td className="w-[24%] border-b border-[var(--mn-wire-subtle)] px-2 py-2 text-[var(--mn-heading)]">{v}</td>
                  <td className="border-b border-[var(--mn-wire-subtle)] px-2 py-2 text-[var(--mn-body)]">{why}</td>
                  <td className="w-[20%] border-b border-[var(--mn-wire-subtle)] px-2 py-2 text-[var(--mn-mist)]">{rep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassPanel>

      <GlassPanel id="intro-synthetic" className="p-5 scroll-mt-28">
        <SectionHeader kicker={L('What is made up', '架空の部分')} title={__ONLY__ ? L('Made up, and real, in this sample report', 'このサンプルレポートの架空の部分と実在の部分') : L('Made up, and real, on the two sample reports', '2つのサンプルレポートの架空の部分と実在の部分')} />
        <div className="grid gap-5 lg:grid-cols-3">
          {__ONLY__ !== 'tourism' && <div>
            <div className="mb-2 text-[14.5px] font-semibold text-[var(--mn-heading)]">{L('Synthetic / modelled: airport retail', '合成・推計：空港リテール')}</div>
            {bullet([
              L('The social-media posts, topics and languages are synthetic — no real posts exist behind them.', 'SNS投稿・話題・言語は合成データで、実際の投稿はありません。'),
              L('Revenue and sales are modelled from real visits × assumed per-visit spend.', '売上は実来訪×想定客単価による推計です。'),
              L('The campaign, the brand, and the zone-to-tenant labels are illustrative; GPS resolves terminal areas, not shops.', '施策・ブランド・エリアと店舗の対応は例示です。GPSはエリア単位で、店舗までは判別しません。'),
            ])}
          </div>}
          {__ONLY__ !== 'retail' && <div>
            <div className="mb-2 text-[14.5px] font-semibold text-[var(--mn-heading)]">{L('Out of scope: inbound tourism', '対象外：インバウンド観光')}</div>
            {bullet([
              L('Inbound visitors by nationality — this is a domestic resident panel, so foreign-carrier devices are a tiny, unrepresentative fraction.', '国籍別のインバウンド訪問者。国内居住者パネルのため、海外キャリアのデバイスはごく一部かつ非代表的です。'),
              L('The region-to-region domestic flows, gateways and route figures shown are real from the panel.', '表示している地域間の国内移動、玄関口、路線に関する数値はパネルの実データです。'),
            ])}
          </div>}
          <div>
            <div className="mb-2 text-[14.5px] font-semibold text-[var(--mn-heading)]">{L('Real', '実在')}</div>
            {bullet([
              L('The methods: normalising for how busy a place is, the normal range, comparison zones, first stop and next stop, and indirect arrivals.', '手法：混雑度による正規化、通常の変動幅、比較エリア、最初と次の立ち寄り、間接到着。'),
              L('Place names, airports and their rough positions; the September 2026 holidays (Silver Week, Sep 19–23).', '地名、空港とおおよその位置、2026年9月の祝日（シルバーウィーク、9月19〜23日）。'),
              ...(__ONLY__ === 'tourism' ? [] : [L('Zara and Mango appear only in the wording of your question, never in the data.', 'ZaraとMangoはご質問の文言にのみ登場し、データには含まれません。')]),
            ])}
          </div>
        </div>
      </GlassPanel>

      <GlassPanel id="intro-needed" className="p-5 scroll-mt-28">
        <SectionHeader kicker={L('Real data we need', '必要な実データ')} title={L('What turns this sample into a real readout', 'サンプルを実際の分析に変えるために必要なもの')} />
        <FeasibilityTable head={[L('Data', 'データ'), L('Do we have it?', '保有状況'), L('Where it comes from', '入手元'), L('What it unlocks', '分かるようになること')]}
          rows={[
            ...(__ONLY__ !== 'tourism' ? [
            { ask: L('Zone-level visits and stop-to-stop paths inside New Chitose', '新千歳空港内のエリア別来訪と立ち寄り順序'), status: 'partial' as const, statusLabel: L('Format exists', '形式あり'),
              how: L('MessyNet’s mobility engine. It already defines a retail-paths output; none has been produced for New Chitose.', 'MessyNetのモビリティエンジン。小売の回遊データの形式は定義済みですが、新千歳空港分は未作成です。'),
              needs: L('All three retail questions, and the real sample size at the airport.', '小売に関する3つのご質問すべてと、空港での実際のサンプル規模。') },
            { ask: L('Daily sales per tenant, and which zone each tenant is in', 'テナント別の日次売上と、各テナントの所在エリア'), status: 'no' as const, statusLabel: L('Needed', '必要'),
              how: L('The airport.', '空港。'), needs: L('Any statement about sales, direct or follow-on.', '直接・波及を問わず、売上に関するすべての判断。') },
            { ask: L('Floor plan with zones marked, per floor', 'エリアを示したフロア別の図面'), status: 'no' as const, statusLabel: L('Needed', '必要'),
              how: L('The airport.', '空港。'), needs: L('Zones drawn to the real terminal rather than a sketch.', 'スケッチではなく実際のターミナルに沿ったエリア設定。') },
            { ask: L('Campaign calendar, and posts about each campaign', '施策カレンダーと各施策に関する投稿'), status: 'partial' as const, statusLabel: L('Posts: we can collect', '投稿は収集可能'),
              how: L('Campaign dates from the airport or brands; posts from MessyNet’s social listening.', '施策日程は空港またはブランド、投稿はMessyNetのソーシャルリスニング。'),
              needs: L('Social media → visits, and how soon visits follow posts.', 'SNS → 来訪の関係と、投稿から来訪までの日数。') },
            { ask: L('In-terminal Wi-Fi or beacon records, or receipt and loyalty data', '館内Wi-Fi・ビーコンの記録、またはレシート・会員データ'), status: 'no' as const, statusLabel: L('Optional', '任意'),
              how: L('The airport or tenants.', '空港またはテナント。'), needs: L('Shop-to-shop paths, such as Zara → Mango.', 'Zara → Mangoのような店舗間の回遊。') },
            ] : []),
            ...(__ONLY__ !== 'retail' ? [
            { ask: L('Inbound visitors: arrival airport, places stayed, SIM country', '訪日客：到着空港、滞在先、SIM国番号'), status: 'partial' as const, statusLabel: L('Format exists', '形式あり'),
              how: L('MessyNet’s mobility engine. A tourism output is defined but was not published with the event data.', 'MessyNetのモビリティエンジン。観光データの形式は定義済みですが、イベントデータとともには公開されていません。'),
              needs: L('All airline questions, and the real share of visitors whose country can be read.', '航空会社に関するご質問すべてと、国・地域が分かる旅行者の実際の割合。') },
            { ask: L('Official arrival statistics by nationality and airport', '国籍別・空港別の公的な入国統計'), status: 'partial' as const, statusLabel: L('Public', '公開情報'),
              how: L('Published government statistics.', '政府が公表している統計。'), needs: L('Correcting the sample so country shares can be sized.', 'サンプルを補正し、国・地域の構成比を推計できるようにする。') },
            { ask: L('Schedules, seats, fares and origin-destination bookings', 'ダイヤ、座席数、運賃、発着地別の予約データ'), status: 'no' as const, statusLabel: L('Needed', '必要'),
              how: L('The airline.', '航空会社。'), needs: L('Turning demand evidence into a route case.', '需要の裏付けを路線計画に変える。') },
            ] : []),
            { ask: L('A full year of data', '通年のデータ'), status: 'no' as const, statusLabel: L('Needed', '必要'),
              how: L('MessyNet’s mobility engine.', 'MessyNetのモビリティエンジン。'), needs: L('Seasons, such as ski season in Hokkaido, and enough ordinary weeks to compare against.', '北海道のスキーシーズンなどの季節性と、比較に十分な通常週。') },
          ]} />
      </GlassPanel>
    </div>
  )
}
