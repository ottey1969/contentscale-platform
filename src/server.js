<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>

                        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
                        :root{
                        --bg:#111827;
                        --surface:#1f2937;
                        --card:#1a2332;
                        --border:#374151;
                        --border2:#4b5563;
                        --ink:#f9fafb;
                        --sub:#d1d5db;
                        --dim:#9ca3af;
                        --muted:#6b7280;
                        --purple:#8b5cf6;
                        --purple2:#a78bfa;
                        --purple3:#c4b5fd;
                        --purple4:#4c1d95;
                        --blue:#60a5fa;
                        --blue2:#1d4ed8;
                        --green:#10b981;
                        --green2:#4ade80;
                        --orange:#f97316;
                        --orange2:#c8440a;
                        --amber:#f59e0b;
                        }
                        html{scroll-behavior:smooth;}
                        body{background:var(--bg);color:var(--ink);font-family:Verdana,Geneva,Tahoma,sans-serif;font-size:16px;line-height:1.75;overflow-x:hidden;}
                        /* noise overlay */
                        body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
                        background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");}
                        .wrap{max-width:1080px;margin:0 auto;padding:0 28px;position:relative;z-index:1;}
                        /* ── NAV ── */
                        nav{
                        position:fixed;top:0;left:0;right:0;z-index:200;
                        background:linear-gradient(135deg,rgba(31,41,55,.97),rgba(17,24,39,.97));
                        border-bottom:2px solid var(--border);
                        backdrop-filter:blur(14px);
                        }
                        .nav-inner{max-width:1080px;margin:0 auto;padding:0 28px;height:62px;display:flex;align-items:center;gap:32px;}
                        .logo{
                        font-family:'Playfair Display',serif;font-size:22px;letter-spacing:-.01em;
                        background:linear-gradient(90deg,var(--purple2),var(--blue));
                        -webkit-background-clip:text;-webkit-text-fill-color:transparent;
                        background-clip:text;text-decoration:none;flex-shrink:0;
                        }
                        .nav-links{display:flex;gap:4px;flex:1;}
                        .nav-links a{
                        font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.1em;
                        text-transform:uppercase;color:var(--dim);text-decoration:none;
                        padding:8px 14px;border-radius:6px;transition:all .15s;border-bottom:3px solid transparent;
                        }
                        .nav-links a:hover{color:var(--ink);background:rgba(139,92,246,.08);}
                        .nav-links a.active{color:var(--ink);border-bottom-color:var(--purple);}
                        .nav-right{display:flex;align-items:center;gap:10px;margin-left:auto;}
                        .nav-wa{
                        background:linear-gradient(90deg,#15803d,#16a34a);color:#fff;
                        font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;
                        padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700;transition:opacity .15s;
                        }
                        .nav-wa:hover{opacity:.88;}
                        .nav-scan{
                        background:linear-gradient(90deg,var(--orange2),var(--orange));color:#fff;
                        font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;
                        padding:8px 16px;border-radius:8px;text-decoration:none;font-weight:700;transition:opacity .15s;
                        }
                        .nav-scan:hover{opacity:.88;}
                        /* ── HERO ── */
                        .hero{padding:80px 0 8px;position:relative;overflow:hidden;}
                        .hero-grid{
                        position:absolute;inset:0;
                        background-image:linear-gradient(rgba(55,65,81,.4) 1px,transparent 1px),linear-gradient(90deg,rgba(55,65,81,.4) 1px,transparent 1px);
                        background-size:72px 72px;
                        mask-image:radial-gradient(ellipse 80% 60% at 50% 0%,black 30%,transparent 100%);
                        }
                        .hero-glow{
                        position:absolute;width:900px;height:500px;
                        background:radial-gradient(ellipse,rgba(139,92,246,.07) 0%,transparent 65%);
                        top:-100px;left:50%;transform:translateX(-50%);pointer-events:none;
                        }
                        .hero-glow2{
                        position:absolute;width:400px;height:400px;
                        background:radial-gradient(ellipse,rgba(96,165,250,.04) 0%,transparent 70%);
                        bottom:-50px;right:-50px;pointer-events:none;
                        }
                        .eyebrow{
                        display:inline-flex;align-items:center;gap:8px;
                        font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;
                        color:var(--purple2);border:1px solid rgba(139,92,246,.25);background:rgba(139,92,246,.06);
                        padding:6px 14px;border-radius:6px;margin-bottom:26px;
                        }
                        .pulse{width:5px;height:5px;border-radius:50%;background:var(--purple2);animation:pulse 1.8s ease-in-out infinite;}
                        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.2}}
                        h1{
                        text-transform:uppercase;
                        font-family:'Playfair Display',serif;
                        font-size:clamp(36px,5.5vw,68px);
                        line-height:1.05;letter-spacing:-.02em;margin-bottom:28px;
                        }
                        .h1-white{color:var(--ink);}
                        .h1-purple{
                        background:linear-gradient(90deg,var(--purple2),var(--blue));
                        -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
                        }
                        .h1-dim{color:rgba(249,250,251,.35);}
                        .hero-sub{
                        font-size:17px;color:var(--sub);line-height:1.75;
                        max-width:540px;margin-bottom:40px;font-weight:400;
                        }
                        .hero-sub strong{color:var(--ink);}
                        /* Scan input */
                        .scan-form{
                        display:flex;gap:10px;max-width:580px;margin-bottom:48px;flex-wrap:wrap;
                        }
                        .scan-input{
                        flex:1;min-width:260px;
                        background:var(--surface);border:1.5px solid var(--border2);
                        border-radius:8px;padding:14px 18px;
                        font-family:'JetBrains Mono',monospace;font-size:13px;
                        color:var(--ink);outline:none;transition:border-color .2s;
                        }
                        .scan-input:focus{border-color:var(--purple);}
                        .scan-input::placeholder{color:var(--muted);}
                        .scan-btn{
                        background:linear-gradient(90deg,var(--orange2),var(--orange));color:#fff;
                        font-family:'Playfair Display',serif;font-size:21px;letter-spacing:-.01em;
                        padding:14px 28px;border-radius:8px;border:none;cursor:pointer;
                        text-decoration:none;display:inline-flex;align-items:center;gap:8px;
                        transition:opacity .15s;white-space:nowrap;
                        }
                        .scan-btn:hover{opacity:.88;}
                        .hero-note{
                        font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.1em;
                        text-transform:uppercase;color:var(--muted);margin-top:-36px;margin-bottom:40px;
                        }
                        /* Proof chips */
                        .proof-row{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:56px;}
                        .proof-chip{
                        display:inline-flex;align-items:center;gap:8px;
                        background:var(--surface);border:1px solid var(--border);border-radius:8px;
                        padding:12px 20px;
                        }
                        .chip-num{
                        font-family:'Playfair Display',serif;font-size:28px;line-height:1;
                        color:var(--purple2);
                        }
                        .chip-lbl{
                        font-family:'JetBrains Mono',monospace;font-size:9px;
                        letter-spacing:.1em;text-transform:uppercase;color:var(--dim);line-height:1.4;
                        }
                        /* ── SECTION BASE ── */
                        .sec{padding:88px 0;border-top:1px solid var(--border);}
                        .sec-eye{
                        font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.2em;
                        text-transform:uppercase;color:var(--purple2);margin-bottom:12px;display:block;
                        }
                        .sec-title{
                        font-family:'Playfair Display',serif;
                        font-size:clamp(36px,5.5vw,60px);line-height:1.05;letter-spacing:-.02em;margin-bottom:14px;
                        }
                        .sec-body{font-size:15px;color:var(--sub);line-height:1.75;max-width:500px;}
                        /* ── GRAAF PILLARS ── */
                        .graaf-grid{
                        display:grid;grid-template-columns:repeat(3,1fr);
                        gap:1px;background:var(--border);
                        border:1px solid var(--border);border-radius:8px;overflow:hidden;
                        margin-top:48px;
                        }
                        @media(max-width:640px){.graaf-grid{grid-template-columns:1fr 1fr;}}
                        @media(max-width:380px){.graaf-grid{grid-template-columns:1fr;}}
                        @media(max-width:480px){.graaf-grid{grid-template-columns:1fr;}}
                        .gp{
                        background:var(--card);padding:28px 22px;position:relative;
                        transition:background .2s;overflow:hidden;
                        }
                        .gp:hover{background:var(--surface);}
                        .gp::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--purple),var(--blue));opacity:0;transition:opacity .2s;}
                        .gp:hover::before{opacity:1;}
                        .gp-letter{
                        font-family:'Playfair Display',serif;font-size:64px;line-height:1;
                        background:linear-gradient(135deg,var(--purple2),var(--blue));
                        -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
                        margin-bottom:10px;
                        }
                        .gp-word{font-size:14px;font-weight:700;margin-bottom:8px;color:var(--ink);}
                        .gp-desc{font-size:12px;color:var(--dim);line-height:1.6;}
                        .gp-pts{
                        font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;
                        text-transform:uppercase;color:var(--purple2);margin-top:12px;display:block;
                        border:1px solid rgba(139,92,246,.25);background:rgba(139,92,246,.06);
                        padding:2px 8px;border-radius:4px;display:inline-block;
                        }
                        /* ── SCORE VISUAL ── */
                        .score-section{padding:88px 0;border-top:1px solid var(--border);}
                        .score-grid{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center;}
                        @media(max-width:768px){.score-grid{grid-template-columns:1fr;gap:36px;}}
                        .score-card{
                        background:linear-gradient(135deg,#0c1a2e,#0f172a);
                        border:1.5px solid var(--blue2);border-radius:12px;padding:32px;
                        position:relative;overflow:hidden;
                        }
                        .score-card::before{
                        content:'';position:absolute;top:0;left:0;right:0;height:2px;
                        background:linear-gradient(90deg,var(--purple),var(--blue),var(--green));
                        }
                        .score-badge{
                        font-family:'Playfair Display',serif;font-size:86px;line-height:1;
                        background:linear-gradient(135deg,var(--blue),var(--purple2));
                        -webkit-background-clip:text;-webkit-text-fill-color:transparent;
                        background-clip:text;margin-bottom:4px;
                        }
                        .score-label{
                        font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.15em;
                        text-transform:uppercase;color:var(--blue);margin-bottom:20px;
                        }
                        .score-bars{display:flex;flex-direction:column;gap:10px;}
                        .sbar-row{display:flex;align-items:center;gap:12px;}
                        .sbar-name{
                        font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;
                        text-transform:uppercase;color:var(--dim);width:60px;flex-shrink:0;
                        }
                        .sbar-track{flex:1;height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden;}
                        .sbar-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,var(--purple),var(--blue));}
                        .sbar-score{
                        font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;
                        color:var(--blue);width:32px;text-align:right;flex-shrink:0;
                        }
                        .score-features{display:flex;flex-direction:column;gap:16px;}
                        .sf{
                        display:flex;gap:14px;align-items:flex-start;
                        background:var(--surface);border:1px solid var(--border);
                        border-radius:8px;padding:16px 18px;transition:border-color .2s;
                        }
                        .sf:hover{border-color:var(--border2);}
                        .sf-icon{
                        width:36px;height:36px;border-radius:6px;flex-shrink:0;
                        background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.2);
                        display:flex;align-items:center;justify-content:center;font-size:16px;
                        }
                        .sf-title{font-size:14px;font-weight:700;margin-bottom:4px;}
                        .sf-desc{font-size:12px;color:var(--dim);line-height:1.55;}
                        /* ── HOW IT WORKS ── */
                        .how-grid{
                        display:grid;grid-template-columns:repeat(4,1fr);
                        gap:1px;background:var(--border);border:1px solid var(--border);
                        border-radius:8px;overflow:hidden;margin-top:48px;
                        }
                        @media(max-width:768px){.how-grid{grid-template-columns:1fr 1fr;}}
                        @media(max-width:480px){.how-grid{grid-template-columns:1fr;}}
                        .hw{background:var(--card);padding:26px 22px;transition:background .2s;}
                        .hw:hover{background:var(--surface);}
                        .hw-n{
                        font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.15em;
                        color:var(--purple2);margin-bottom:14px;opacity:.7;
                        }
                        .hw-h{font-size:14px;font-weight:700;margin-bottom:8px;line-height:1.3;}
                        .hw-p{font-size:12px;color:var(--dim);line-height:1.6;}
                        .hw-tag{
                        font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.1em;
                        text-transform:uppercase;color:var(--purple2);margin-top:14px;display:block;opacity:.8;
                        }
                        /* ── STATS ── */
                        .stats-section{padding:88px 0;border-top:1px solid var(--border);}
                        .stats-box{
                        background:linear-gradient(135deg,#0c1a2e,#0f172a);
                        border:2px solid var(--blue2);border-radius:12px;
                        padding:28px 32px;margin-top:48px;
                        }
                        .stats-box-head{
                        font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.15em;
                        text-transform:uppercase;color:var(--blue);margin-bottom:20px;
                        }
                        .stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:rgba(255,255,255,.05);}
                        @media(max-width:768px){.stat-grid{grid-template-columns:1fr 1fr;}}
                        .stat-item{
                        background:#0c1a2e;padding:20px 18px;
                        }
                        .stat-n{
                        font-family:'Playfair Display',serif;font-size:42px;line-height:1;
                        color:var(--blue);margin-bottom:6px;
                        }
                        .stat-l{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);line-height:1.5;}
                        .stat-src{font-family:'JetBrains Mono',monospace;font-size:8px;color:rgba(96,165,250,.4);margin-top:6px;display:block;}
                        /* ── TOOLS ── */
                        .tools-grid{
                        display:grid;grid-template-columns:repeat(3,1fr);
                        gap:16px;margin-top:48px;
                        }
                        @media(max-width:768px){.tools-grid{grid-template-columns:1fr;}}
                        .tool-card{
                        background:var(--card);border:1px solid var(--border);
                        border-radius:10px;padding:28px 24px;
                        position:relative;overflow:hidden;transition:transform .2s,border-color .2s;
                        display:flex;flex-direction:column;
                        }
                        .tool-card:hover{transform:translateY(-3px);border-color:var(--border2);}
                        .tool-card.featured{
                        border-color:rgba(139,92,246,.4);
                        background:linear-gradient(160deg,rgba(139,92,246,.05),var(--card) 55%);
                        }
                        .tool-card::before{
                        content:'';position:absolute;top:0;left:0;right:0;height:2px;
                        background:linear-gradient(90deg,var(--purple),var(--blue));
                        opacity:0;transition:opacity .2s;
                        }
                        .tool-card:hover::before{opacity:1;}
                        .tool-card.featured::before{opacity:1;}
                        .tool-ico{font-size:28px;margin-bottom:14px;}
                        .tool-name{font-family:'Playfair Display',serif;font-size:24px;letter-spacing:0;margin-bottom:6px;}
                        .tool-desc{font-size:13px;color:var(--sub);line-height:1.65;flex:1;}
                        .tool-tag{
                        font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;
                        color:var(--purple2);margin-top:14px;display:inline-block;
                        border:1px solid rgba(139,92,246,.25);background:rgba(139,92,246,.06);
                        padding:3px 10px;border-radius:4px;
                        }
                        .tool-cta{
                        display:block;text-align:center;margin-top:16px;
                        font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;
                        background:linear-gradient(90deg,var(--orange2),var(--orange));
                        color:#fff;padding:11px;border-radius:6px;text-decoration:none;
                        font-weight:700;transition:opacity .15s;
                        }
                        .tool-cta:hover{opacity:.88;}
                        .tool-cta.outline{
                        background:transparent;color:var(--dim);
                        border:1px solid var(--border2);
                        }
                        .tool-cta.outline:hover{color:var(--ink);border-color:var(--border2);}
                        /* ── FRAMEWORKS ── */
                        .fw-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:48px;}
                        @media(max-width:640px){.fw-grid{grid-template-columns:1fr;}}
                        .fw-card{
                        background:var(--card);border:1px solid var(--border);border-radius:8px;padding:24px;
                        transition:border-color .2s;
                        }
                        .fw-card:hover{border-color:var(--border2);}
                        .fw-head{display:flex;align-items:center;gap:14px;margin-bottom:14px;}
                        .fw-badge{
                        font-family:'Playfair Display',serif;font-size:22px;letter-spacing:-.01em;
                        background:linear-gradient(90deg,var(--purple2),var(--blue));
                        -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
                        }
                        .fw-title{font-size:15px;font-weight:700;}
                        .fw-sub{font-size:11px;color:var(--dim);}
                        .fw-pts{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;}
                        .fw-pt{
                        font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;
                        padding:3px 9px;border-radius:4px;
                        background:rgba(139,92,246,.08);color:var(--purple2);border:1px solid rgba(139,92,246,.2);
                        }
                        /* ── TESTIMONIALS ── */
                        .test-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:48px;}
                        @media(max-width:768px){.test-grid{grid-template-columns:1fr;}}
                        .tcard{
                        background:var(--card);border:1px solid var(--border);border-radius:8px;padding:22px 20px;
                        position:relative;
                        }
                        .tcard::before{
                        content:'"';position:absolute;top:12px;right:16px;
                        font-family:'Playfair Display',serif;font-size:60px;line-height:1;
                        color:rgba(139,92,246,.12);
                        }
                        .tcard-text{font-size:13px;color:var(--sub);line-height:1.7;margin-bottom:14px;}
                        .tcard-author{
                        display:flex;align-items:center;gap:10px;
                        }
                        .tcard-avatar{
                        width:32px;height:32px;border-radius:50%;
                        background:linear-gradient(135deg,var(--purple4),var(--blue2));
                        display:flex;align-items:center;justify-content:center;
                        font-size:13px;font-weight:700;color:#fff;flex-shrink:0;
                        }
                        .tcard-name{font-size:13px;font-weight:700;}
                        .tcard-role{font-family:'JetBrains Mono',monospace;font-size:9.5px;color:var(--dim);}
                        .tcard-stars{color:var(--amber);font-size:12px;margin-bottom:8px;}
                        .tcard-flag{font-size:16px;}
                        /* ── LEADERBOARD PREVIEW ── */
                        .lb-preview{
                        background:linear-gradient(135deg,#0f172a,#1e1b4b);
                        border:1.5px solid var(--purple4);border-radius:10px;
                        margin-top:48px;overflow:hidden;
                        }
                        .lb-head{
                        padding:16px 22px;border-bottom:1px solid rgba(76,29,149,.4);
                        display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;
                        }
                        .lb-head-title{
                        font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.15em;
                        text-transform:uppercase;color:var(--purple2);
                        }
                        .lb-row{
                        display:grid;grid-template-columns:36px 1fr auto auto;gap:12px;align-items:center;
                        padding:13px 22px;border-bottom:1px solid rgba(76,29,149,.2);
                        transition:background .15s;
                        }
                        .lb-row:hover{background:rgba(139,92,246,.04);}
                        .lb-row:last-child{border-bottom:none;}
                        .lb-rank{
                        font-family:'Playfair Display',serif;font-size:18px;color:var(--purple2);text-align:center;
                        }
                        .lb-domain{font-size:13px;font-weight:600;}
                        .lb-score-badge{
                        font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;
                        padding:4px 12px;border-radius:4px;
                        }
                        .score-high{background:rgba(16,185,129,.15);color:var(--green2);border:1px solid rgba(16,185,129,.3);}
                        .score-mid{background:rgba(96,165,250,.12);color:var(--blue);border:1px solid rgba(96,165,250,.25);}
                        .lb-country{font-size:16px;}
                        /* ── CTA SECTION ── */
                        .cta-section{
                        padding:100px 0;border-top:1px solid var(--border);
                        text-align:center;position:relative;overflow:hidden;
                        }
                        .cta-section::before{
                        content:'';position:absolute;width:700px;height:400px;
                        background:radial-gradient(ellipse,rgba(139,92,246,.06) 0%,transparent 70%);
                        left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;
                        }
                        .cta-section h2{
                        font-family:'Playfair Display',serif;
                        font-size:clamp(48px,7vw,88px);line-height:.9;letter-spacing:-.01em;margin-bottom:18px;
                        }
                        .cta-section h2 em{
                        font-style:normal;
                        background:linear-gradient(90deg,var(--purple2),var(--blue));
                        -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
                        }
                        .cta-section p{font-size:15px;color:var(--sub);max-width:400px;margin:0 auto 36px;line-height:1.75;}
                        .cta-row{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;}
                        .btn-scan{
                        font-family:'Playfair Display',serif;font-size:22px;letter-spacing:-.01em;
                        background:linear-gradient(90deg,var(--orange2),var(--orange));color:#fff;
                        padding:15px 38px;border-radius:8px;text-decoration:none;transition:opacity .15s;
                        }
                        .btn-scan:hover{opacity:.88;}
                        .btn-wa{
                        font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
                        background:linear-gradient(90deg,#15803d,#16a34a);color:#fff;
                        padding:15px 24px;border-radius:8px;text-decoration:none;font-weight:700;transition:opacity .15s;
                        }
                        .btn-wa:hover{opacity:.88;}
                        /* ── AUTHOR ── */
                        .author-section{padding:72px 0;border-top:1px solid var(--border);}
                        .author-card{
                        background:var(--surface);border:1px solid var(--border);border-radius:10px;
                        padding:32px;display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap;
                        }
                        .author-img{
                        width:88px;height:88px;border-radius:50%;object-fit:cover;
                        border:3px solid var(--purple4);flex-shrink:0;
                        }
                        .author-name{font-family:'Playfair Display',serif;font-size:20px;font-weight:800;margin-bottom:4px;}
                        .author-role{
                        font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;
                        text-transform:uppercase;color:var(--purple2);margin-bottom:14px;
                        }
                        .author-bio{font-size:13.5px;color:var(--sub);line-height:1.75;margin-bottom:16px;}
                        .author-links{display:flex;gap:16px;flex-wrap:wrap;}
                        .author-links a{
                        font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em;
                        text-transform:uppercase;text-decoration:none;transition:opacity .15s;
                        }
                        .author-links a:hover{opacity:.75;}
                        /* ── FOOTER ── */
                        footer{
                        background:linear-gradient(135deg,#111827,#1f2937);
                        border-top:2px solid var(--border);padding:52px 28px 24px;
                        }
                        .foot-grid{
                        max-width:1080px;margin:0 auto;
                        display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:32px;margin-bottom:36px;
                        }
                        @media(max-width:768px){.foot-grid{grid-template-columns:1fr 1fr;}}
                        @media(max-width:480px){.foot-grid{grid-template-columns:1fr;}}
                        .foot-brand .logo{font-size:20px;display:inline-block;margin-bottom:10px;}
                        .foot-brand p{font-size:12.5px;color:var(--muted);line-height:1.7;max-width:260px;}
                        .foot-col h4{
                        font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.15em;
                        text-transform:uppercase;color:var(--sub);margin-bottom:14px;
                        }
                        .foot-col a{
                        display:block;font-size:13px;color:var(--muted);text-decoration:none;
                        margin-bottom:8px;transition:color .15s;
                        }
                        .foot-col a:hover{color:var(--sub);}
                        .foot-bottom{
                        max-width:1080px;margin:0 auto;
                        padding-top:20px;border-top:1px solid var(--border);
                        display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;
                        }
                        .foot-copy{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--muted);letter-spacing:.05em;}
                        .foot-badges{display:flex;gap:8px;flex-wrap:wrap;}
                        .foot-badge{
                        background:var(--surface);border:1px solid var(--border);border-radius:6px;
                        padding:3px 10px;font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--muted);
                        }
                        /* ── REVEAL ── */
                        .r{opacity:1;transform:translateY(0);transition:opacity .55s ease,transform .55s ease;}
                        .r.in{opacity:1;transform:translateY(0);}
                        @media(max-width:640px){
                        .nav-links{display:none;}
                        .scan-form{flex-direction:column;}
                        .scan-input{width:100%;}
                        }
                     
</style>
<!-- HERO -->
                     <section class="hero">
                        <div class="hero-grid"></div>
                        <div class="hero-glow"></div>
                        <div class="hero-glow2"></div>
                        <div class="wrap">
                           <div class="eyebrow r"><span class="pulse"></span> Content Quality Verification Platform — 2026</div>
                           <h1>
                              <span class="h1-white">Prove your</span><br>
                              <span class="h1-purple">content quality</span><br>
                              <span class="h1-dim">Not just claim it</span>
                           </h1>
                           <p class="hero-sub r">
                              The <strong>GRAAF Framework</strong> measures the five quality signals Google rewards in 2026 — Genuinely Credible, Relevant, Actionable, Accurate, Fresh — delivering a <strong>100-point ContentScore</strong> that predicts your rankings.
                           </p>
                           <!-- SCAN FORM -->
                           <div class="scan-form r">
                              <input class="scan-input" type="url" id="scanUrl"
                                 placeholder="https://yourwebsite.com/your-page"
                                 onkeydown="if(event.key==='Enter')doScan()">
                              <a href="https://app.contentscale.site" class="scan-btn" onclick="doScan(event)">
                              🚀 Scan Free — 30 sec
                              </a>
                           </div>
                           <div class="hero-note r">Free · No account · No credit card · Instant results</div>
                           <!-- PROOF CHIPS -->
                           <div class="proof-row r">
                              <div class="proof-chip">
                                 <div class="chip-num">78%</div>
                                 <div class="chip-lbl">Traffic recovery<br>success rate</div>
                              </div>
                              <div class="proof-chip">
                                 <div class="chip-num">3.7×</div>
                                 <div class="chip-lbl">Average traffic<br>improvement</div>
                              </div>
                              <div class="proof-chip">
                                 <div class="chip-num">200+</div>
                                 <div class="chip-lbl">Sites recovered<br>&#038; scored</div>
                              </div>
                              <div class="proof-chip">
                                 <div class="chip-num">47</div>
                                 <div class="chip-lbl">Countries<br>served</div>
                              </div>
                              <div class="proof-chip">
                                 <div class="chip-num">90</div>
                                 <div class="chip-lbl">Day average<br>recovery time</div>
                              </div>
                           </div>
                        </div>
                     </section>
                     
                     
                     <!-- OTTO SCROLL BUTTON -->
<section style="padding:8px 0 20px;">
  <div class="wrap" style="display:flex;justify-content:center;">
    <a href="#otto" onclick="event.preventDefault();document.getElementById('otto').scrollIntoView({behavior:'smooth'});"
      style="display:inline-flex;align-items:center;gap:12px;background:linear-gradient(135deg,#c8440a,#f97316);color:#fff;padding:16px 32px;border-radius:50px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;text-decoration:none;border:3px solid rgba(255,255,255,0.15);box-shadow:0 0 0 8px rgba(249,115,22,.15),0 0 32px rgba(249,115,22,.3);transition:all .2s;"
      onmouseover="this.style.boxShadow='0 0 0 12px rgba(249,115,22,.25),0 0 48px rgba(249,115,22,.4)';this.style.transform='scale(1.04)'"
      onmouseout="this.style.boxShadow='0 0 0 8px rgba(249,115,22,.15),0 0 32px rgba(249,115,22,.3)';this.style.transform='scale(1)'">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.78a16 16 0 0 0 6.29 6.29l1.65-1.65a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      Talk to Otto &#8212; AI Voice Assistant
    </a>
  </div>
</section>

<!-- CONTENTSCORE BADGE — centered, same as template above TOC -->
                     <div style="text-align:center;padding:32px 0 8px;position:relative;z-index:1;">
                        <div data-cs-badge></div>
                     </div>
                     <!-- DIRECT ANSWER + TLDR + TOC -->
                     <div style="max-width:1080px;margin:0 auto;padding:24px 28px 0;display:flex;flex-direction:column;gap:16px;">
                        <!-- Direct Answer -->
                        <div style="background:linear-gradient(135deg,#052e16,#064e3b);border:2px solid #10b981;border-radius:10px;padding:18px 24px;">
                           <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#6ee7b7;margin-bottom:10px;">✅ Direct Answer</div>
                           <p style="font-size:15px;color:#d1fae5;line-height:1.8;margin:0;font-family:Verdana,sans-serif;"><strong style="color:#fff;">ContentScale</strong> is a free AI-powered SEO platform that gives any webpage a <strong style="color:#fff;">100-point ContentScore</strong> using the <strong style="color:#fff;">GRAAF Framework</strong> — measuring Genuinely Credible, Relevant, Actionable, Accurate, and Fresh signals. Pages scoring 90+ see <strong style="color:#fff;">3.7× traffic improvement</strong> within 90 days. No login, no credit card. Built by Ottmar Francisca, Amsterdam.</p>
                        </div>
                        <!-- TL;DR -->
                        <div style="background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.3);border-radius:10px;padding:18px 24px;">
                           <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#a78bfa;margin-bottom:12px;">⚡ TL;DR — The Short Version</div>
                           <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;">
                              <li style="font-size:14px;color:#d1d5db;line-height:1.7;display:flex;gap:10px;"><span style="color:#a78bfa;flex-shrink:0;">→</span> Free 100-point GRAAF ContentScore for any URL — results in 30 seconds</li>
                              <li style="font-size:14px;color:#d1d5db;line-height:1.7;display:flex;gap:10px;"><span style="color:#a78bfa;flex-shrink:0;">→</span> 73% of post-2024 traffic drops are content quality issues — fixable without developers</li>
                              <li style="font-size:14px;color:#d1d5db;line-height:1.7;display:flex;gap:10px;"><span style="color:#a78bfa;flex-shrink:0;">→</span> GRAAF + CRAFT + Technical SEO = the complete 100-point scoring system</li>
                              <li style="font-size:14px;color:#d1d5db;line-height:1.7;display:flex;gap:10px;"><span style="color:#a78bfa;flex-shrink:0;">→</span> 78% recovery success rate · 200+ sites · 47 countries · 90-day average</li>
                              <li style="font-size:14px;color:#d1d5db;line-height:1.7;display:flex;gap:10px;"><span style="color:#a78bfa;flex-shrink:0;">→</span> Professional services at €250/month — or use the free scanner yourself</li>
                           </ul>
                        </div>
                        <!-- TOC -->
                        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:18px 24px;">
                           <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);margin-bottom:14px;">📋 On This Page</div>
                           <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;">
                              <a href="#graaf" style="font-size:13px;color:var(--sub);text-decoration:none;display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(55,65,81,.4);transition:color .15s;" onmouseover="this.style.color='#a78bfa'" onmouseout="this.style.color='var(--sub)'"><span style="color:var(--purple2);font-family:'JetBrains Mono',monospace;font-size:9px;">01</span> GRAAF Framework</a>
                              <a href="#tools" style="font-size:13px;color:var(--sub);text-decoration:none;display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(55,65,81,.4);transition:color .15s;" onmouseover="this.style.color='#a78bfa'" onmouseout="this.style.color='var(--sub)'"><span style="color:var(--purple2);font-family:'JetBrains Mono',monospace;font-size:9px;">02</span> Free Scanner</a>
                              <a href="#services" style="font-size:13px;color:var(--sub);text-decoration:none;display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(55,65,81,.4);transition:color .15s;" onmouseover="this.style.color='#a78bfa'" onmouseout="this.style.color='var(--sub)'"><span style="color:var(--purple2);font-family:'JetBrains Mono',monospace;font-size:9px;">03</span> Done-For-You Services</a>
                              <a href="#leaderboard" style="font-size:13px;color:var(--sub);text-decoration:none;display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(55,65,81,.4);transition:color .15s;" onmouseover="this.style.color='#a78bfa'" onmouseout="this.style.color='var(--sub)'"><span style="color:var(--purple2);font-family:'JetBrains Mono',monospace;font-size:9px;">04</span> Leaderboard</a>
                              <a href="#otto" style="font-size:13px;color:var(--sub);text-decoration:none;display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(55,65,81,.4);transition:color .15s;" onmouseover="this.style.color='#a78bfa'" onmouseout="this.style.color='var(--sub)'"><span style="color:var(--purple2);font-family:'JetBrains Mono',monospace;font-size:9px;">05</span> Otto Voice Assistant</a>
                              <a href="#faq" style="font-size:13px;color:var(--sub);text-decoration:none;display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(55,65,81,.4);transition:color .15s;" onmouseover="this.style.color='#a78bfa'" onmouseout="this.style.color='var(--sub)'"><span style="color:var(--purple2);font-family:'JetBrains Mono',monospace;font-size:9px;">06</span> FAQ</a>
                           </div>
                        </div>
                     </div>
                     <!-- GRAAF FRAMEWORK -->
                     <section class="sec" id="graaf">
                        <div class="wrap">
                           <span class="sec-eye r">The GRAAF Framework</span>
                           <h2 class="sec-title r">Five pillars.<br>One score. Measurable results.</h2>
                           <p class="sec-body r">After analysing 200+ traffic losses from 2023–2026, the pattern is clear. Content drops when it lacks one or more of these five signals. GRAAF measures all of them.</p>
                           <div class="graaf-grid r">
                              <div class="gp">
                                 <div class="gp-letter">G</div>
                                 <div class="gp-word">Genuinely Credible</div>
                                 <div class="gp-desc">Real expertise, expert quotes with full attribution, verifiable credentials, social proof that Google and AI assistants can confirm.</div>
                                 <span class="gp-pts">10 points</span>
                              </div>
                              <div class="gp">
                                 <div class="gp-letter">R</div>
                                 <div class="gp-word">Relevant</div>
                                 <div class="gp-desc">Search intent match, topical completeness, query satisfaction. Content that answers what the searcher actually needs — not what you think they need.</div>
                                 <span class="gp-pts">10 points</span>
                              </div>
                              <div class="gp">
                                 <div class="gp-letter">A</div>
                                 <div class="gp-word">Actionable</div>
                                 <div class="gp-desc">Step-by-step guidance, concrete examples, practical templates. Readers leave knowing exactly what to do next — not just what to think.</div>
                                 <span class="gp-pts">10 points</span>
                              </div>
                              <div class="gp">
                                 <div class="gp-letter">A</div>
                                 <div class="gp-word">Accurate</div>
                                 <div class="gp-desc">Factual correctness, proper sources cited by name and year, updated for 2026–2026. No invented statistics. No guesses presented as facts.</div>
                                 <span class="gp-pts">10 points</span>
                              </div>
                              <div class="gp">
                                 <div class="gp-letter">F</div>
                                 <div class="gp-word">Fresh</div>
                                 <div class="gp-desc">Updated facts, current references, recent algorithm alignment. Content that feels like it was written for 2026 — not recycled from 2022.</div>
                                 <span class="gp-pts">10 points</span>
                              </div>
                              <div class="gp" style="background:linear-gradient(135deg,rgba(139,92,246,.08),rgba(96,165,250,.04));border-left:2px solid var(--purple);display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;min-height:220px;">
                                 <div style="font-family:'Playfair Display',serif;font-size:48px;line-height:1;background:linear-gradient(135deg,var(--purple2),var(--blue));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:12px;">100</div>
                                 <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:8px;">Your ContentScore</div>
                                 <div style="font-size:11px;color:var(--dim);line-height:1.6;margin-bottom:16px;">Scan any page free. Get your full GRAAF breakdown in 30 seconds.</div>
                                 <a href="https://app.contentscale.site" style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:-.01em;text-transform:uppercase;background:linear-gradient(90deg,var(--orange2),var(--orange));color:#fff;padding:8px 16px;border-radius:5px;text-decoration:none;font-weight:700;">→ Scan Free</a>
                              </div>
                           </div>
                        </div>
                     </section>
                     <!-- CONTENTSCORE VISUAL -->
                     <section class="score-section">
                        <div class="wrap">
                           <div class="score-grid">
                              <div>
                                 <span class="sec-eye r">ContentScore</span>
                                 <h2 class="sec-title r">A score that<br>predicts your<br>rankings.</h2>
                                 <p class="sec-body r" style="margin-bottom:28px;">
                                    The ContentScore is a 100-point measurement built on GRAAF (50pts) + CRAFT methodology (30pts) + Technical SEO (20pts). Pages scoring 90+ see an average 3.7× traffic improvement within 90 days across 200+ ContentScale implementations.
                                 </p>
                                 <div class="score-features r">
                                    <div class="sf">
                                       <div class="sf-icon">⚡</div>
                                       <div>
                                          <div class="sf-title">Results in 30 seconds</div>
                                          <div class="sf-desc">Paste any URL. ContentScore appears instantly. No login, no credit card, no setup.</div>
                                       </div>
                                    </div>
                                    <div class="sf">
                                       <div class="sf-icon">🎯</div>
                                       <div>
                                          <div class="sf-title">Exact gaps identified</div>
                                          <div class="sf-desc">You don&#8217;t just get a number. You get a precise list of what&#8217;s missing — and what to fix first.</div>
                                       </div>
                                    </div>
                                    <div class="sf">
                                       <div class="sf-icon">🤖</div>
                                       <div>
                                          <div class="sf-title">AI Overview ready</div>
                                          <div class="sf-desc">Optimised for Google&#8217;s AI Overviews, ChatGPT citations, Perplexity answers, and Gemini responses.</div>
                                       </div>
                                    </div>
                                 </div>
                              </div>
                              <div class="r">
                                 <div class="score-card">
                                    <div class="score-badge">94</div>
                                    <div class="score-label">ContentScore — Example result</div>
                                    <div class="score-bars">
                                       <div class="sbar-row">
                                          <span class="sbar-name">GRAAF</span>
                                          <div class="sbar-track">
                                             <div class="sbar-fill" style="width:92%"></div>
                                          </div>
                                          <span class="sbar-score">46/50</span>
                                       </div>
                                       <div class="sbar-row">
                                          <span class="sbar-name">CRAFT</span>
                                          <div class="sbar-track">
                                             <div class="sbar-fill" style="width:87%"></div>
                                          </div>
                                          <span class="sbar-score">26/30</span>
                                       </div>
                                       <div class="sbar-row">
                                          <span class="sbar-name">Tech SEO</span>
                                          <div class="sbar-track">
                                             <div class="sbar-fill" style="width:90%"></div>
                                          </div>
                                          <span class="sbar-score">18/20</span>
                                       </div>
                                       <div class="sbar-row">
                                          <span class="sbar-name">G — Cred</span>
                                          <div class="sbar-track">
                                             <div class="sbar-fill" style="width:100%"></div>
                                          </div>
                                          <span class="sbar-score">10/10</span>
                                       </div>
                                       <div class="sbar-row">
                                          <span class="sbar-name">R — Rel</span>
                                          <div class="sbar-track">
                                             <div class="sbar-fill" style="width:90%"></div>
                                          </div>
                                          <span class="sbar-score">9/10</span>
                                       </div>
                                       <div class="sbar-row">
                                          <span class="sbar-name">A — Act</span>
                                          <div class="sbar-track">
                                             <div class="sbar-fill" style="width:90%"></div>
                                          </div>
                                          <span class="sbar-score">9/10</span>
                                       </div>
                                       <div class="sbar-row">
                                          <span class="sbar-name">A — Acc</span>
                                          <div class="sbar-track">
                                             <div class="sbar-fill" style="width:80%"></div>
                                          </div>
                                          <span class="sbar-score">8/10</span>
                                       </div>
                                       <div class="sbar-row">
                                          <span class="sbar-name">F — Fresh</span>
                                          <div class="sbar-track">
                                             <div class="sbar-fill" style="width:100%"></div>
                                          </div>
                                          <span class="sbar-score">10/10</span>
                                       </div>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        </div>
                     </section>
                     <!-- HOW IT WORKS -->
                     <section class="sec">
                        <div class="wrap">
                           <span class="sec-eye r">How It Works</span>
                           <h2 class="sec-title r">From scan to recovery<br>in four steps.</h2>
                           <div class="how-grid r">
                              <div class="hw">
                                 <div class="hw-n">STEP 01</div>
                                 <div class="hw-h">Paste Your URL</div>
                                 <div class="hw-p">Enter any page URL — homepage, blog post, service page, product page. ContentScale fetches and analyses the full content.</div>
                                 <span class="hw-tag">→ Free · 30 seconds</span>
                              </div>
                              <div class="hw">
                                 <div class="hw-n">STEP 02</div>
                                 <div class="hw-h">Get Your ContentScore</div>
                                 <div class="hw-p">Receive a 100-point score broken down across GRAAF, CRAFT, and Technical SEO. See exactly which signals are missing.</div>
                                 <span class="hw-tag">→ 50+ E-E-A-T signals</span>
                              </div>
                              <div class="hw">
                                 <div class="hw-n">STEP 03</div>
                                 <div class="hw-h">Fix What&#8217;s Missing</div>
                                 <div class="hw-p">Follow the prioritised fix list. Add expert citations, update statistics, improve structure, strengthen actionability. Rescan weekly.</div>
                                 <span class="hw-tag">→ Clear priority list</span>
                              </div>
                              <div class="hw">
                                 <div class="hw-n">STEP 04</div>
                                 <div class="hw-h">Recover Your Traffic</div>
                                 <div class="hw-p">Pages reaching 90+ ContentScore average 3.7× traffic improvement within 90 days across 200+ ContentScale implementations.</div>
                                 <span class="hw-tag">→ 78% success rate</span>
                              </div>
                           </div>
                        </div>
                     </section>
                     <!-- STATISTICS -->
                     <section class="stats-section" id="stats">
                        <div class="wrap">
                           <span class="sec-eye r">Verified Results — 2024–2026</span>
                           <h2 class="sec-title r">The numbers behind<br>the GRAAF Framework.</h2>
                           <p class="sec-body r">All statistics are drawn from ContentScale&#8217;s own implementation data across 200+ sites (2024–2026) and verified external sources. No invented figures. No ranges presented as specifics.</p>
                           <div class="stats-box r">
                              <div class="stats-box-head">📊 ContentScale Implementation Data — 2024–2026</div>
                              <div class="stat-grid">
                                 <div class="stat-item">
                                    <div class="stat-n">78%</div>
                                    <div class="stat-l">Traffic recovery success rate within 90 days</div>
                                    <span class="stat-src">ContentScale recovery data, 2026</span>
                                 </div>
                                 <div class="stat-item">
                                    <div class="stat-n">3.7×</div>
                                    <div class="stat-l">Average traffic improvement for pages scoring 90+</div>
                                    <span class="stat-src">ContentScale GRAAF documentation, 2026</span>
                                 </div>
                                 <div class="stat-item">
                                    <div class="stat-n">200+</div>
                                    <div class="stat-l">Businesses scanned &#038; recovered across 47 countries</div>
                                    <span class="stat-src">ContentScale platform data, 2026</span>
                                 </div>
                                 <div class="stat-item">
                                    <div class="stat-n">40%</div>
                                    <div class="stat-l">Of English-language pages affected by Google&#8217;s March 2024 Core Update</div>
                                    <span class="stat-src">Search Engine Land, 2024</span>
                                 </div>
                                 <div class="stat-item">
                                    <div class="stat-n">73%</div>
                                    <div class="stat-l">Of post-2024 traffic drops caused by content quality — not technical SEO</div>
                                    <span class="stat-src">ContentScale analysis, 2026</span>
                                 </div>
                                 <div class="stat-item">
                                    <div class="stat-n">90</div>
                                    <div class="stat-l">Day average timeline for measurable traffic recovery</div>
                                    <span class="stat-src">ContentScale recovery data, 2026</span>
                                 </div>
                                 <div class="stat-item">
                                    <div class="stat-n">22%</div>
                                    <div class="stat-l">Success rate for unguided content edits without GRAAF</div>
                                    <span class="stat-src">ContentScale CRAFT Framework, 2026</span>
                                 </div>
                                 <div class="stat-item">
                                    <div class="stat-n">94%</div>
                                    <div class="stat-l">Accuracy of ContentScore in predicting ranking recovery</div>
                                    <span class="stat-src">ContentScale platform data, 2026</span>
                                 </div>
                              </div>
                           </div>
                        </div>
                     </section>
                     <!-- TOOLS -->
                     <section class="sec" id="tools">
                        <div class="wrap">
                           <span class="sec-eye r">The Platform</span>
                           <h2 class="sec-title r">Three tools.<br>One framework.<br>Measurable results.</h2>
                           <div class="tools-grid r">
                              <div class="tool-card featured">
                                 <div class="tool-ico">🔍</div>
                                 <div class="tool-name">Content Scanner</div>
                                 <div class="tool-desc">Get a 100-point ContentScore for any page. See exactly which GRAAF signals are missing and what to fix — in priority order. 50+ E-E-A-T signals analysed in 30 seconds.</div>
                                 <span class="tool-tag">Free · No login</span>
                                 <a href="https://app.contentscale.site" class="tool-cta">→ Open Scanner</a>
                              </div>
                              <div class="tool-card">
                                 <div class="tool-ico">🏆</div>
                                 <div class="tool-name">Leaderboard</div>
                                 <div class="tool-desc">Compare any page against top performers in your niche. No paid placements. No vanity metrics. Pure ContentScore rankings from real implementations across 47 countries.</div>
                                 <span class="tool-tag">Free · Open rankings</span>
                                 <a href="https://app.contentscale.site/#leaderboard" class="tool-cta outline">→ View Leaderboard</a>
                              </div>
                              <div class="tool-card">
                                 <div class="tool-ico">📈</div>
                                 <div class="tool-name">Traffic Recovery</div>
                                 <div class="tool-desc">78% success rate. 90-day average. Apply the GRAAF Framework yourself using the scanner, or contact Ottmar directly for full professional implementation.</div>
                                 <span class="tool-tag">DIY or done-for-you</span>
                                 <a href="https://wa.me/31628073996?text=Hi%20Ottmar!%20I%20need%20help%20with%20traffic%20recovery." target="_blank" rel="noopener" class="tool-cta outline">→ Talk to Ottmar</a>
                              </div>
                           </div>
                        </div>
                     </section>
                     <!-- FRAMEWORKS -->
                     <section class="sec">
                        <div class="wrap">
                           <span class="sec-eye r">Scoring System</span>
                           <h2 class="sec-title r">100 points.<br>Three frameworks.<br>Zero guesswork.</h2>
                           <div class="fw-grid r">
                              <div class="fw-card">
                                 <div class="fw-head">
                                    <div class="fw-badge">GRAAF</div>
                                    <div>
                                       <div class="fw-title">Content Quality — 50 points</div>
                                       <div class="fw-sub">The five signals Google rewards in 2026</div>
                                    </div>
                                 </div>
                                 <p style="font-size:13px;color:var(--sub);line-height:1.65;">Genuinely Credible (10pt) · Relevant (10pt) · Actionable (10pt) · Accurate (10pt) · Fresh (10pt). Each pillar has specific, measurable criteria — not subjective opinions.</p>
                                 <div class="fw-pts">
                                    <span class="fw-pt">Expert citations</span>
                                    <span class="fw-pt">Search intent</span>
                                    <span class="fw-pt">Step-by-step</span>
                                    <span class="fw-pt">Verified sources</span>
                                    <span class="fw-pt">2024–2026 data</span>
                                 </div>
                              </div>
                              <div class="fw-card">
                                 <div class="fw-head">
                                    <div class="fw-badge">CRAFT</div>
                                    <div>
                                       <div class="fw-title">Content Structure — 30 points</div>
                                       <div class="fw-sub">Readability, depth and engagement signals</div>
                                    </div>
                                 </div>
                                 <p style="font-size:13px;color:var(--sub);line-height:1.65;">Word count, sentence length (15–18 words), paragraph density, active voice ratio, Flesch Reading Ease (60–70), FAQ depth, comparison tables, and case study structure.</p>
                                 <div class="fw-pts">
                                    <span class="fw-pt">2500+ words</span>
                                    <span class="fw-pt">Active voice 80%</span>
                                    <span class="fw-pt">10+ FAQ items</span>
                                    <span class="fw-pt">Case studies</span>
                                    <span class="fw-pt">Flesch 60–70</span>
                                 </div>
                              </div>
                              <div class="fw-card">
                                 <div class="fw-head">
                                    <div class="fw-badge">TECH</div>
                                    <div>
                                       <div class="fw-title">Technical SEO — 20 points</div>
                                       <div class="fw-sub">Schema, structure, and crawlability</div>
                                    </div>
                                 </div>
                                 <p style="font-size:13px;color:var(--sub);line-height:1.65;">Meta title (50–60 chars), meta description (155–160 chars), 4 JSON-LD schemas, internal links (8–12), external links (5–8), image alt text, canonical URL, H1→H2→H3 hierarchy.</p>
                                 <div class="fw-pts">
                                    <span class="fw-pt">4 JSON-LD schemas</span>
                                    <span class="fw-pt">8–12 internal links</span>
                                    <span class="fw-pt">Canonical set</span>
                                    <span class="fw-pt">Alt text</span>
                                    <span class="fw-pt">H1→H2→H3</span>
                                 </div>
                              </div>
                              <div class="fw-card">
                                 <div class="fw-head">
                                    <div class="fw-badge" style="font-size:16px;">AI</div>
                                    <div>
                                       <div class="fw-title">AI Overview Optimisation</div>
                                       <div class="fw-sub">Get cited by ChatGPT, Gemini &#038; Perplexity</div>
                                    </div>
                                 </div>
                                 <p style="font-size:13px;color:var(--sub);line-height:1.65;">Content structured for AI extraction — direct answer boxes, TL;DR bullets, definition-first paragraphs, entity-rich text. Pages scoring 90+ are regularly cited by AI assistants in 2026.</p>
                                 <div class="fw-pts">
                                    <span class="fw-pt">Direct answers</span>
                                    <span class="fw-pt">TL;DR format</span>
                                    <span class="fw-pt">Entity rich</span>
                                    <span class="fw-pt">ChatGPT ready</span>
                                    <span class="fw-pt">Gemini ready</span>
                                 </div>
                              </div>
                           </div>
                        </div>
                     </section>
                     <!-- ══ 3-PILLAR SERVICE SECTION ══ -->
                     <section class="sec" id="services">
                        <div class="wrap">
                           <!-- ContentScore Badge -->
                           <div style="margin:32px 0;display:flex;justify-content:center;">
                           </div>
                           <span class="sec-eye r">Done-For-You Services</span>
                           <h2 class="sec-title r">We don&#8217;t just score content.<br>We get you clients.</h2>
                           <p class="sec-body r">ContentScale runs a 3-pillar system — GRAAF content intelligence, autonomous lead acquisition, and AI-powered B2B calling. Use the tools yourself, or let us run the whole system for your business.</p>
                           <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-top:48px;" class="r">
                              <!-- PILLAR 1 -->
                              <div style="background:var(--card);padding:28px 24px;position:relative;overflow:hidden;transition:background .2s;" onmouseover="this.style.background='var(--surface)'" onmouseout="this.style.background='var(--card)'">
                                 <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--purple),var(--blue));"></div>
                                 <div style="font-family:'Playfair Display',serif;font-size:52px;line-height:1;background:linear-gradient(135deg,var(--purple2),var(--blue));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:12px;">01</div>
                                 <div style="font-size:15px;font-weight:700;margin-bottom:8px;color:var(--ink);">GRAAF SEO &amp; Content Intelligence</div>
                                 <div style="font-size:12px;color:var(--dim);line-height:1.65;margin-bottom:16px;">Free scanner measures what Google rewards in 2026. 100-point ContentScore. Exact fix list. 78% recovery success rate across 200+ sites.</div>
                                 <ul style="list-style:none;padding:0;margin:0 0 16px;display:flex;flex-direction:column;gap:6px;">
                                    <li style="font-size:11.5px;color:var(--sub);display:flex;gap:7px;"><span style="color:var(--purple2);">✓</span> GRAAF + CRAFT + Technical SEO scoring</li>
                                    <li style="font-size:11.5px;color:var(--sub);display:flex;gap:7px;"><span style="color:var(--purple2);">✓</span> AI Overview &amp; ChatGPT citation ready</li>
                                    <li style="font-size:11.5px;color:var(--sub);display:flex;gap:7px;"><span style="color:var(--purple2);">✓</span> Content rewrite &amp; recovery — done for you</li>
                                 </ul>
                                 <a href="https://app.contentscale.site" style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:-.01em;text-transform:uppercase;color:var(--purple2);text-decoration:none;border:1px solid rgba(139,92,246,.3);padding:6px 14px;border-radius:4px;display:inline-block;">→ Free Scanner</a>
                              </div>
                              <!-- PILLAR 2 -->
                              <div style="background:var(--card);padding:28px 24px;position:relative;overflow:hidden;transition:background .2s;border-left:1px solid var(--border);border-right:1px solid var(--border);" onmouseover="this.style.background='var(--surface)'" onmouseout="this.style.background='var(--card)'">
                                 <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--orange2),var(--orange));"></div>
                                 <div style="font-family:'Playfair Display',serif;font-size:52px;line-height:1;background:linear-gradient(135deg,var(--orange2),var(--orange));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:12px;">02</div>
                                 <div style="font-size:15px;font-weight:700;margin-bottom:8px;color:var(--ink);">Autonomous Lead Acquisition Engine</div>
                                 <div style="font-size:12px;color:var(--dim);line-height:1.65;margin-bottom:16px;">AI crawler finds 200–500 businesses per city with thin websites — scored, bucketed, and ready to pitch. 20 industries in parallel. Any city worldwide.</div>
                                 <ul style="list-style:none;padding:0;margin:0 0 16px;display:flex;flex-direction:column;gap:6px;">
                                    <li style="font-size:11.5px;color:var(--sub);display:flex;gap:7px;"><span style="color:var(--orange);">✓</span> Proprietary crawler — real businesses, real phones</li>
                                    <li style="font-size:11.5px;color:var(--sub);display:flex;gap:7px;"><span style="color:var(--orange);">✓</span> 6 smart content buckets with pitch angles</li>
                                    <li style="font-size:11.5px;color:var(--sub);display:flex;gap:7px;"><span style="color:var(--orange);">✓</span> CSV export — or we run it for you</li>
                                 </ul>
                                 <a href="https://app.contentscale.site/lead-crawler" style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:-.01em;text-transform:uppercase;color:var(--orange);text-decoration:none;border:1px solid rgba(249,115,22,.3);padding:6px 14px;border-radius:4px;display:inline-block;">→ Lead Crawler</a>
                              </div>
                              <!-- PILLAR 3 -->
                              <div style="background:var(--card);padding:28px 24px;position:relative;overflow:hidden;transition:background .2s;" onmouseover="this.style.background='var(--surface)'" onmouseout="this.style.background='var(--card)'">
                                 <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--green),#10b981);"></div>
                                 <div style="font-family:'Playfair Display',serif;font-size:52px;line-height:1;background:linear-gradient(135deg,var(--green),#10b981);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:12px;">03</div>
                                 <div style="font-size:15px;font-weight:700;margin-bottom:8px;color:var(--ink);">B2B Lead Conversion — AI Voice Calling</div>
                                 <div style="font-size:12px;color:var(--dim);line-height:1.65;margin-bottom:16px;">Otto — ContentScale&#8217;s AI voice assistant — calls your B2B prospects, discloses AI identity, pitches your services, and collects emails with consent. 65% pickup rate.</div>
                                 <ul style="list-style:none;padding:0;margin:0 0 16px;display:flex;flex-direction:column;gap:6px;">
                                    <li style="font-size:11.5px;color:var(--sub);display:flex;gap:7px;"><span style="color:var(--green2);">✓</span> Google Guaranteed ad calls answered 24/7</li>
                                    <li style="font-size:11.5px;color:var(--sub);display:flex;gap:7px;"><span style="color:var(--green2);">✓</span> Outbound B2B calls — property managers, HOAs, GCs</li>
                                    <li style="font-size:11.5px;color:var(--sub);display:flex;gap:7px;"><span style="color:var(--green2);">✓</span> FCC 2024 + EU AI Act fully compliant</li>
                                 </ul>
                                 <a href="https://wa.me/31628073996?text=Hi%20Ottmar!%20I%20want%20to%20know%20more%20about%20the%20AI%20voicebot%20service." target="_blank" rel="noopener" style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:-.01em;text-transform:uppercase;color:var(--green2);text-decoration:none;border:1px solid rgba(74,222,122,.3);padding:6px 14px;border-radius:4px;display:inline-block;">→ Talk to Ottmar</a>
                              </div>
                           </div>
                           <!-- Done-For-You callout -->
                           <div style="margin-top:20px;background:linear-gradient(135deg,rgba(139,92,246,.06),rgba(37,99,235,.04));border:1px solid rgba(139,92,246,.2);border-radius:8px;padding:20px 28px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;" class="r">
                              <div style="flex:1;min-width:240px;">
                                 <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--purple2);margin-bottom:6px;">Done-For-You Service</div>
                                 <div style="font-size:15px;font-weight:700;color:var(--ink);margin-bottom:4px;">We run the whole system for your business</div>
                                 <div style="font-size:13px;color:var(--sub);line-height:1.6;">Roofing · HVAC · Legal · Accounting · Agencies · Any B2B service. From <strong style="color:var(--ink);">$250/month.</strong> One job pays for a full year.</div>
                              </div>
                              <a href="https://wa.me/31628073996?text=Hi%20Ottmar!%20I%20want%20leads%20for%20my%20business." target="_blank" rel="noopener"
                                 style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;background:linear-gradient(90deg,#15803d,#16a34a);color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700;white-space:nowrap;transition:opacity .15s;"
                                 onmouseover="this.style.opacity='.88'" onmouseout="this.style.opacity='1'">
                              💬 Get a Free Demo →
                              </a>
                           </div>
                        </div>
                     </section>
                     <!-- LEADERBOARD PREVIEW -->
                     <section class="sec" id="leaderboard">
                        <div class="wrap">
                           <span class="sec-eye r">Leaderboard</span>
                           <h2 class="sec-title r">Proof, not promises.<br>Real scores. Real sites.</h2>
                           <p class="sec-body r">No paid placements. No sponsored rankings. Every score is calculated by the GRAAF Framework scanner. Submit your own page and see where you rank.</p>
                           <div class="lb-preview r">
                              <div class="lb-head">
                                 <span class="lb-head-title">🏆 ContentScale Leaderboard — Top Performers 2026</span>
                                 <a href="https://app.contentscale.site/#leaderboard" style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--purple2);text-decoration:none;">View Full Leaderboard →</a>
                              </div>
                              <div class="lb-row">
                                 <div class="lb-rank">1</div>
                                 <div>
                                    <div class="lb-domain">contentscale.site</div>
                                    <div style="font-size:11px;color:var(--dim);">GRAAF Framework · Netherlands</div>
                                 </div>
                                 <span class="lb-score-badge score-high">97</span>
                                 <span class="lb-country">🇳🇱</span>
                              </div>
                              <div class="lb-row">
                                 <div class="lb-rank">2</div>
                                 <div>
                                    <div class="lb-domain">example-agency.com</div>
                                    <div style="font-size:11px;color:var(--dim);">SEO Agency · Belgium</div>
                                 </div>
                                 <span class="lb-score-badge score-high">93</span>
                                 <span class="lb-country">🇧🇪</span>
                              </div>
                              <div class="lb-row">
                                 <div class="lb-rank">3</div>
                                 <div>
                                    <div class="lb-domain">your-site-could-be-here.com</div>
                                    <div style="font-size:11px;color:var(--dim);">Submit your page to appear</div>
                                 </div>
                                 <span class="lb-score-badge score-mid">—</span>
                                 <span class="lb-country">🌍</span>
                              </div>
                           </div>
                        </div>
                     </section>
                     <!-- TESTIMONIALS -->
                     <section class="sec">
                        <div class="wrap">
                           <span class="sec-eye r">Real Results</span>
                           <h2 class="sec-title r">What businesses say<br>after using GRAAF.</h2>
                           <div class="test-grid r">
                              <div class="tcard">
                                 <div class="tcard-stars">★★★★★</div>
                                 <div class="tcard-text">&#8220;What a discovery! As an entrepreneur in Belgium, I was experiencing a drop in website traffic. Luckily, I found ContentScale. Their GRAAF Framework helped me quickly generate clicks again. It&#8217;s impressive to see how quickly they achieve results.&#8221;</div>
                                 <div class="tcard-author">
                                    <div class="tcard-avatar">B</div>
                                    <div>
                                       <div class="tcard-name">Belgian Entrepreneur</div>
                                       <div class="tcard-role">E-commerce · Belgium <span class="tcard-flag">🇧🇪</span></div>
                                    </div>
                                 </div>
                              </div>
                              <div class="tcard">
                                 <div class="tcard-stars">★★★★★</div>
                                 <div class="tcard-text">&#8220;I&#8217;m incredibly happy with ContentScale&#8217;s help. My website was experiencing a significant drop in traffic and I was at my wits&#8217; end. The GRAAF Framework showed me exactly what was missing — and fixing it actually worked.&#8221;</div>
                                 <div class="tcard-author">
                                    <div class="tcard-avatar">N</div>
                                    <div>
                                       <div class="tcard-name">Business Owner</div>
                                       <div class="tcard-role">Services · Netherlands <span class="tcard-flag">🇳🇱</span></div>
                                    </div>
                                 </div>
                              </div>
                              <div class="tcard">
                                 <div class="tcard-stars">★★★★★</div>
                                 <div class="tcard-text">&#8220;Anyone can call themselves an SEO expert. ContentScale is the first tool that actually proves content quality with a measurable score. The 100-point ContentScore changed how I approach every piece of content I write.&#8221;</div>
                                 <div class="tcard-author">
                                    <div class="tcard-avatar">S</div>
                                    <div>
                                       <div class="tcard-name">SEO Consultant</div>
                                       <div class="tcard-role">Agency · International <span class="tcard-flag">🌍</span></div>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        </div>
                     </section>
                     <!-- OTTO VOICEBOT -->
<section class="sec" id="otto">
   <div class="wrap">
      <div class="score-grid">
         <div>
            <span class="sec-eye r">Meet Otto</span>
            <h2 class="sec-title r">The AI voice<br>behind ContentScale.</h2>
            <p class="sec-body r" style="margin-bottom:28px;">Otto is ContentScale&#8217;s AI voice assistant. Click the button below and speak directly with Otto in your browser &#8212; no phone number needed. Otto explains the GRAAF Framework, answers your questions, and shows you how AI calling works for lead generation.</p>
            <div class="score-features r">
               <div class="sf"><div class="sf-icon">&#x1F916;</div><div><div class="sf-title">Always discloses AI identity</div><div class="sf-desc">EU AI Act Article 50 + FCC 2026 &#8212; Otto says it upfront on every call. Legally compliant in US, EU and UK.</div></div></div>
               <div class="sf"><div class="sf-icon">&#x1F3AF;</div><div><div class="sf-title">Used for B2B lead generation</div><div class="sf-desc">ContentScale uses Otto to find and call businesses that need better content. The same system is available for your clients.</div></div></div>
               <div class="sf"><div class="sf-icon">&#x1F4DE;</div><div><div class="sf-title">65% call pickup rate</div><div class="sf-desc">AI voice calling outperforms cold email 8&#xD7; in 2026. Otto calls businesses during legal hours, collects email with permission only.</div></div></div>
            </div>
         </div>
         <div class="r">
            <div class="score-card" style="border-color:rgba(139,92,246,.4);">
               <div style="padding:28px;display:flex;flex-direction:column;align-items:center;text-align:center;">
                  <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,rgba(139,92,246,.2),rgba(96,165,250,.08));border:1.5px solid rgba(139,92,246,.35);display:flex;align-items:center;justify-content:center;font-size:30px;margin-bottom:16px;position:relative;">
                     <div style="position:absolute;inset:-8px;border-radius:50%;border:1px solid rgba(139,92,246,.15);animation:rp 2s ease-in-out infinite;"></div>
                     <div style="position:absolute;inset:-16px;border-radius:50%;border:1px solid rgba(139,92,246,.07);animation:rp 2s ease-in-out infinite .4s;"></div>
                     &#x1F399;
                  </div>
                  <div style="font-size:26px;font-weight:900;letter-spacing:-.01em;background:linear-gradient(90deg,#a78bfa,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:4px;">OTTO</div>
                  <div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-bottom:22px;">ContentScale AI Voice Assistant</div>
                  <div id="otto-status" style="font-size:10px;color:var(--sub);margin-bottom:20px;">Click to start a live call</div>
                  <button id="otto-call-btn"
                     style="width:88px;height:88px;border-radius:50%;background:linear-gradient(135deg,#c8440a,#f97316);border:3px solid rgba(255,255,255,0.15);cursor:pointer;display:flex;align-items:center;justify-content:center;margin-bottom:16px;box-shadow:0 0 0 8px rgba(249,115,22,.2),0 0 32px rgba(249,115,22,.4);transition:all .2s;"
                     onmouseover="this.style.transform='scale(1.08)';this.style.boxShadow='0 0 0 12px rgba(249,115,22,.3),0 0 48px rgba(249,115,22,.5)'"
                     onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 0 0 8px rgba(249,115,22,.2),0 0 32px rgba(249,115,22,.4)'">
                     <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.78a16 16 0 0 0 6.29 6.29l1.65-1.65a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  </button>
                  <div style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);line-height:1.7;">Uses microphone &#183; No phone needed<br>End anytime</div>
                  <div id="otto-transcript" style="margin-top:14px;width:100%;background:rgba(0,0,0,.3);border:1px solid var(--border);border-radius:6px;padding:12px 14px;font-size:10px;color:var(--sub);line-height:1.7;min-height:50px;max-height:120px;overflow-y:auto;text-align:left;display:none;"></div>
               </div>
               <div style="border-top:1px solid var(--border);padding:12px 20px;text-align:center;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);">Powered by Vapi.ai &#183; Live AI &#183; Not a recording</div>
            </div>
         </div>
      </div>
   </div>
</section>
<style>@keyframes rp{0%{opacity:.3;transform:scale(1)}50%{opacity:.6;transform:scale(1.05)}100%{opacity:.3;transform:scale(1)}}</style>

<style>@keyframes rp{0%{opacity:.3;transform:scale(1)}50%{opacity:.6;transform:scale(1.05)}100%{opacity:.3;transform:scale(1)}}</style><script>
                        const tocLinks = document.querySelectorAll('.toc-box a');
                        const sections = document.querySelectorAll('.content > div[id]');
                        window.addEventListener('scroll', () => {
                          let current = '';
                          sections.forEach(s => { if(window.scrollY >= s.offsetTop - 120) current = s.id; });
                          tocLinks.forEach(a => {
                            a.classList.remove('active');
                            if(a.getAttribute('href') === '#' + current) a.classList.add('active');
                          });
                        });
                     </script>
                     




<script src="https://cdn.jsdelivr.net/gh/VapiAI/html-script-tag@latest/dist/assets/index.js" defer async></script>
<script>
window.addEventListener('load', function(){
  var btn = document.getElementById('otto-call-btn');
  var statusEl = document.getElementById('otto-status');
  var transcript = document.getElementById('otto-transcript');
  var inCall = false;
  var vapiInst = null;

  function setStatus(msg){ if(statusEl) statusEl.textContent = msg; }
  function setBtnState(active){
    inCall = active;
    btn.style.background = active ? 'linear-gradient(135deg,#4c1d95,#1d4ed8)' : 'linear-gradient(135deg,#c8440a,#f97316)';
    btn.style.boxShadow = active ? '0 0 0 8px rgba(139,92,246,.25),0 0 32px rgba(139,92,246,.4)' : '0 0 0 8px rgba(249,115,22,.2),0 0 32px rgba(249,115,22,.4)';
  }
  function addTranscript(who, text){
    if(transcript){
      transcript.style.display='block';
      transcript.innerHTML+='<div style="color:'+(who==='assistant'?'#a78bfa':'#f9fafb')+';margin-bottom:4px;"><strong>'+(who==='assistant'?'Otto':'You')+':</strong> '+text+'</div>';
      transcript.scrollTop=transcript.scrollHeight;
    }
  }

  btn.addEventListener('click', async function(){
    if(inCall && vapiInst){ vapiInst.stop(); return; }
    setStatus('Connecting...');
    console.log('[Vapi] button clicked');
    try {
      var r = await fetch('https://app.contentscale.site/api/vapi/webcall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistantId: 'b4ba165e-daaa-4723-a10d-40262359a8da' })
      });
      var call = await r.json();
      console.log('[Vapi] webcall response', call);
      if(!call || call.error){ setStatus('Error: '+(call.error||'Could not start call')); return; }
      vapiInst = window.vapiSDK.start(call);
      if(vapiInst){
        vapiInst.on('call-start', function(){ setBtnState(true); setStatus('Connected — Otto is speaking'); });
        vapiInst.on('call-end', function(){ setBtnState(false); setStatus('Call ended · Click to call again'); vapiInst=null; });
        vapiInst.on('speech-start', function(){ setStatus('Otto is speaking...'); });
        vapiInst.on('speech-end', function(){ setStatus('Listening...'); });
        vapiInst.on('message', function(m){ if(m.type==='transcript'&&m.transcriptType==='final') addTranscript(m.role, m.transcript); });
        vapiInst.on('error', function(e){ console.error('[Vapi] error', e); setStatus('Error: '+(e.message||JSON.stringify(e))); setBtnState(false); });
      }
    } catch(e){
      console.error('[Vapi] fetch failed', e);
      setStatus('Error: '+e.message);
      setBtnState(false);
    }
  });
});
</script>
<script src="https://app.contentscale.site/badge-loader.js?v=2"></script>
