// Premium is coming soon (PREMIUM_AVAILABLE in src/service/premium.js); this card says so and offers nothing to buy.
export default function PremiumSettings(){
  return <section className="panel set premium-settings" aria-label="IV Outreach Premium">
    <div className="set-head"><p className="eyebrow">Premium <span className="chip">Coming soon</span></p><h2>More reach is on the way.</h2><p className="small dim">Paid contact data and extra discovery will come later. Everything in IV Outreach today is free with your own Claude Code, Codex or Hermes.</p></div>
  </section>
}
