/**
 * The example the bootstrap_review description carries (takeover design 0.6
 * §5.9, decision d-agent-examples): every class of text the main agent
 * writes for the takeover has one example in the description of the tool
 * that carries it, checked by the same rules as a real call (the L2 runs
 * this one through them). The domain is a small Python tool that reads
 * weather-station CSV files and draws daily charts, so no example word
 * collides with the calibration exercises.
 */

/** The example, as the model reads it: the call, the fields it returns, and what to do with them. */
export const BOOTSTRAP_REVIEW_EXAMPLE = [
  'Example. You read the README and roadmap of a Python tool that reads weather-station CSV files and draws daily charts: two goals, 14 tasks, 9 of them already in the commit history. Call',
  'bootstrap_review {"summary": "The project reads sensor CSV files from weather stations and draws daily charts. README and ROADMAP give two goals: reliable daily charts, and a monthly summary report. 9 of the 14 roadmap tasks have commits in history.tsv. The roadmap lists one open fork (keep CSV files or move to SQLite); I left it out of the nodes."}',
  'It returns round 1 with form recommend, a title, the question text, proposal, reason, cost, notTaken, the attach "bootstrap:tk-3k9x0a1b:list-1", recordedAs "照第 1 版清单接管" and args, the exact propose_to_human arguments as one JSON object. Pass args to the human unchanged, in your own reply, with',
  'propose_to_human {"kind": "question", "form": "recommend", "parent": "<anchor id>", "title": "照这份清单接管「气象站数据工具」", "text": "照这份清单接管「气象站数据工具」：读出 2 个目标、14 件活，我建议同意后把 9 件已做完的标成完成、其余等你说再动，因为这 9 件都带提交号，可以吗？代价是 uv run pytest 在副本里没跑通，合入前才知道结果。", "proposal": "同意后把 9 件已做完的标成完成、其余等你说再动", "reason": "这 9 件都带提交号", "cost": "uv run pytest 在副本里没跑通，合入前才知道结果", "notTaken": "没让现在的 86 条旧告警挡合入，只挡新出的", "attach": "bootstrap:tk-3k9x0a1b:list-1"}',
  'and put the question after your report, last in your reply. When the human agrees, call record_human_answer with kind question, answer agree, their exact words, and recordedAs exactly "照第 1 版清单接管".',
].join('\n')
