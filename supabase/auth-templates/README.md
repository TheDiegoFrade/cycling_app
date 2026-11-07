# Plantillas de correo de Supabase Auth

Copia de lo que está en Supabase → Authentication → Email Templates (las
manda Supabase por el SMTP de Resend como `Torq <no-reply@mail.ridetorq.app>`).
Si cambias una aquí, pégala allá (o aplícala con la Management API,
`PATCH /v1/projects/<ref>/config/auth`).

| Plantilla | Asunto | Archivo | Link del botón |
|---|---|---|---|
| Invite user | `Te invitaron a Torq` | `invite.html` | `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite` |
| Reset password | `Cambia tu contraseña de Torq` | `recovery.html` | `{{ .SiteURL }}/?reset=1&token_hash={{ .TokenHash }}&type=recovery` |

Configuración de Auth que estas plantillas necesitan (ver
`docs/cobro-y-registro.md`, «Supabase Auth»):

- Site URL: `https://ridetorq.app` (con `https://`).
- Redirect URLs: incluye `https://ridetorq.app/**`.
- Email OTP expiration (`mailer_otp_exp`): `86400` (24 h; los correos lo dicen).
- Mínimo de contraseña (`password_min_length`): `8` (igual que la app).
- «Allow new users to sign up»: apagado (solo por invitación).

Los cambios de plantilla y asunto pueden tardar unos minutos en aplicarse
después de guardarlos.
