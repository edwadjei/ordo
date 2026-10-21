/** Email-safe markup: inline styles, no remote images, scripts, or tracking. */
export function ordoSignInEmail(code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error('Invalid sign-in code format');
  const subject = 'Your Ordo sign-in code';
  const text = `ordo.\nFrom thought to done.\n\nSign in to Ordo\n\nYour sign-in code: ${code}\n\nEnter this code in the Ordo window where you started signing in. It expires in 5 minutes and can only be used once.\n\nNever share this code. If you did not request it, you can ignore this email.\n\nYour thoughts. Your space. Your next step.`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in to Ordo</title></head>
<body style="margin:0;padding:0;background:#f5f5f3;color:#272b2e;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;font-size:1px;color:#f5f5f3;max-height:0;overflow:hidden;">Your Ordo sign-in code. Expires in five minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f3;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 8px 24px;font-family:Georgia,serif;font-size:42px;font-weight:bold;letter-spacing:-2px;">ordo<span style="color:#ff6a00;">.</span></td></tr>
<tr><td style="padding:32px 28px;background:#ffffff;border:1px solid #e8e9e7;border-radius:12px;">
<span style="display:inline-block;padding:6px 10px;background:#ff6a00;color:#202224;font-family:monospace;font-size:11px;letter-spacing:2px;">01 / YOUR SPACE</span>
<h1 style="margin:24px 0 14px;font-family:Georgia,serif;font-size:32px;font-weight:normal;line-height:1.2;letter-spacing:-0.5px;">A calmer way in.</h1>
<p style="margin:0 0 24px;color:#616b73;font-size:15px;line-height:1.7;">Enter this code in the Ordo window where you started signing in.</p>
<div aria-label="Your sign-in code" style="padding:22px 16px;background:#f5f6f6;border:1px solid #e8ecee;border-radius:8px;color:#272b2e;font-family:monospace;font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;">${code}</div>
<p style="margin:16px 0 0;color:#616b73;font-size:13px;line-height:1.7;">Valid for <strong>5 minutes</strong>. This code can only be used once.</p>
<hr style="border:0;border-top:1px solid #eceeef;margin:28px 0;">
<p style="margin:0;color:#727c83;font-size:12px;line-height:1.8;">Never share your code. If you didn’t request it, you can safely ignore this email.</p>
</td></tr>
<tr><td style="padding:24px 8px;color:#778189;font-size:12px;line-height:1.8;">From thought to done.<br>Your thoughts. Your space. Your next step.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
