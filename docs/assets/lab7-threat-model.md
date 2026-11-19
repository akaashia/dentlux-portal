# DentLux threat model

Бұл модельдің Threat Dragon project export-ы жоқ. Компоненттер: пациент браузері, staff браузері, REST API, OTP/session, RBAC, PostgreSQL, SMS gateway, Telegram API. Шекаралар: клиент/сервер; app/DB; app/сыртқы provider. Ағындар: HTTPS API; session cookie; параметрленген SQL; SMS request; one-time Telegram linking token.

STRIDE: spoofing — OTP brute force / account linkage; tampering — IDOR және request role; repudiation — audit; disclosure — PII logs; DoS — SMS abuse; privilege elevation — staff role assignment. Тиісті RAID: R11,R12,R13,R20,R21,R22,R23.
