# Graph Report - .  (2026-06-23)

## Corpus Check
- Large corpus: 551 files · ~830,211 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 126 nodes · 86 edges · 69 communities (6 shown, 63 thin omitted)
- Extraction: 59% EXTRACTED · 41% INFERRED · 0% AMBIGUOUS · INFERRED: 35 edges (avg confidence: 0.86)
- Token cost: 7,450 input · 3,300 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Payment Comprobante Uploads|Payment Comprobante Uploads]]
- [[_COMMUNITY_HR & Task Queue Setup|HR & Task Queue Setup]]
- [[_COMMUNITY_Frontend Brand Assets|Frontend Brand Assets]]
- [[_COMMUNITY_Cobranza Email Notifications|Cobranza Email Notifications]]
- [[_COMMUNITY_Celery Worker Configuration|Celery Worker Configuration]]
- [[_COMMUNITY_Technical Debt Registry|Technical Debt Registry]]
- [[_COMMUNITY_Django Admin Static UI|Django Admin Static UI]]
- [[_COMMUNITY_DRF Static Assets|DRF Static Assets]]
- [[_COMMUNITY_Frontend App Entry|Frontend App Entry]]
- [[_COMMUNITY_DatePickerES|DatePickerES]]
- [[_COMMUNITY_calcAVEC|calcAVEC]]
- [[_COMMUNITY_calcPrimaAntiguedad|calcPrimaAntiguedad]]
- [[_COMMUNITY_calcPrimaPostgrado|calcPrimaPostgrado]]
- [[_COMMUNITY_calcSueldoBase|calcSueldoBase]]
- [[_COMMUNITY_loadCestaConfig|loadCestaConfig]]
- [[_COMMUNITY_saveCestaConfig|saveCestaConfig]]
- [[_COMMUNITY_validarCedula|validarCedula]]
- [[_COMMUNITY_useAlumnos|useAlumnos]]
- [[_COMMUNITY_useAsistencia|useAsistencia]]
- [[_COMMUNITY_useAuditoria|useAuditoria]]
- [[_COMMUNITY_useBancosCobranza|useBancosCobranza]]
- [[_COMMUNITY_useBancosNomina|useBancosNomina]]
- [[_COMMUNITY_useBoletin|useBoletin]]
- [[_COMMUNITY_useConciliador|useConciliador]]
- [[_COMMUNITY_useConfiguracion|useConfiguracion]]
- [[_COMMUNITY_useConfiguracionNotificaciones|useConfiguracionNotificaciones]]
- [[_COMMUNITY_useDashboardStats|useDashboardStats]]
- [[_COMMUNITY_useEscape|useEscape]]
- [[_COMMUNITY_useFocusTrap|useFocusTrap]]
- [[_COMMUNITY_useGrados|useGrados]]
- [[_COMMUNITY_useHorarios|useHorarios]]
- [[_COMMUNITY_useInscripcion|useInscripcion]]
- [[_COMMUNITY_useInstitucionPDF|useInstitucionPDF]]
- [[_COMMUNITY_useLapsos|useLapsos]]
- [[_COMMUNITY_useLogosRecibo|useLogosRecibo]]
- [[_COMMUNITY_useLogsSistemas|useLogsSistemas]]
- [[_COMMUNITY_nombreGradoCompleto|nombreGradoCompleto]]
- [[_COMMUNITY_useMatriculaGrado|useMatriculaGrado]]
- [[_COMMUNITY_useMensualidadesAlumno|useMensualidadesAlumno]]
- [[_COMMUNITY_useMorosos|useMorosos]]
- [[_COMMUNITY_useNomina|useNomina]]
- [[_COMMUNITY_useNotas|useNotas]]
- [[_COMMUNITY_useNotificaciones|useNotificaciones]]
- [[_COMMUNITY_useRecibo|useRecibo]]
- [[_COMMUNITY_useRepresentantes|useRepresentantes]]
- [[_COMMUNITY_useSyncedLocalStorage|useSyncedLocalStorage]]
- [[_COMMUNITY_useTiposCargo|useTiposCargo]]
- [[_COMMUNITY_useUsuariosSistemas|useUsuariosSistemas]]
- [[_COMMUNITY_EmpleadoForm|EmpleadoForm]]
- [[_COMMUNITY_EmpleadoModal|EmpleadoModal]]
- [[_COMMUNITY_ReciboModal|ReciboModal]]
- [[_COMMUNITY_cell_|cell_]]
- [[_COMMUNITY_ModalLapso|ModalLapso]]
- [[_COMMUNITY_TablaNotas|TablaNotas]]
- [[_COMMUNITY_Frontend README|Frontend README]]
- [[_COMMUNITY_Comprobantes|Comprobantes]]
- [[_COMMUNITY_Conciliador|Conciliador]]
- [[_COMMUNITY_Grados|Grados]]
- [[_COMMUNITY_parseStatement|parseStatement]]
- [[_COMMUNITY_generarBoletinPDF|generarBoletinPDF]]
- [[_COMMUNITY_generarPlanillaBancaribePDF|generarPlanillaBancaribePDF]]
- [[_COMMUNITY_generarReciboAVECPDF|generarReciboAVECPDF]]
- [[_COMMUNITY_generarReciboSimplePDF|generarReciboSimplePDF]]
- [[_COMMUNITY_generarTXTBancaribe|generarTXTBancaribe]]
- [[_COMMUNITY_planillaBancaribePDFBytes|planillaBancaribePDFBytes]]
- [[_COMMUNITY_reciboAVECBytes|reciboAVECBytes]]
- [[_COMMUNITY_reciboSimpleBytes|reciboSimpleBytes]]
- [[_COMMUNITY_txtBancaribe|txtBancaribe]]
- [[_COMMUNITY_calcDefinitiva|calcDefinitiva]]

## God Nodes (most connected - your core abstractions)
1. `octopus-api Python Dependencies` - 8 edges
2. `Octopus Frontend Brand Identity` - 7 edges
3. `Celery Beat Scheduler` - 6 edges
4. `Base Email HTML Template` - 6 edges
5. `NOTAS_TECNICAS - Technical Debt Document` - 6 edges
6. `Arranque Celery - Setup Guide` - 5 edges
7. `Celery Worker Process` - 5 edges
8. `Automated Debt Collection Notification Flow` - 5 edges
9. `Redis Message Broker` - 4 edges
10. `import_docentes_final.py Script` - 3 edges

## Surprising Connections (you probably didn't know these)
- `Celery Worker Process` --requires--> `Celery 5.6.3 Dependency`  [INFERRED]
  octopus-api/ARRANQUE_CELERY.md → octopus-api/requirements.txt
- `Celery Beat Scheduler` --requires--> `django-celery-beat 2.9.0 Dependency`  [INFERRED]
  octopus-api/ARRANQUE_CELERY.md → octopus-api/requirements.txt
- `Celery Beat Scheduler` --schedules--> `Automated Debt Collection Notification Flow`  [INFERRED]
  octopus-api/ARRANQUE_CELERY.md → octopus-api/notificaciones/templates/notificaciones/mora_dia_0.html
- `Redis Message Broker` --requires--> `Redis 8.0.0 Client Dependency`  [INFERRED]
  octopus-api/ARRANQUE_CELERY.md → octopus-api/requirements.txt
- `Mora Dia 5 - Primer Recordatorio Email Template` --part_of--> `Automated Debt Collection Notification Flow`  [INFERRED]
  octopus-api/notificaciones/templates/notificaciones/mora_dia_5.html → octopus-api/notificaciones/templates/notificaciones/mora_dia_0.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Celery Task Queue Infrastructure (Worker + Beat + Redis)** — octopus_api_arranque_celery_celery_worker, octopus_api_arranque_celery_celery_beat, octopus_api_arranque_celery_redis_broker [EXTRACTED 1.00]
- **Automated Cobranza Email Notification Templates** — notificaciones_mora_dia_0_template, notificaciones_mora_dia_5_template, notificaciones_mora_dia_10_template, notificaciones_mora_dia_15_template [EXTRACTED 1.00]
- **Portal Authentication Security Technical Debt** — octopus_frontend_notas_security_debt, octopus_frontend_notas_auth_debt, octopus_frontend_notas_refresh_jwt_dup [INFERRED 0.85]
- **All Payment Comprobante Images** — comprobantes_pago, comprobantes_pago_3iwNz0a, comprobantes_pago_temlyez, comprobantes_pago_tm81abp, comprobantes_pago_wobanHV, comprobantes_pago_zixbuo8, comprobantes_pago_fdomxeu, comprobantes_pago_ftbn1zy, comprobantes_pago_iuwjgez, comprobantes_pago_jpy1ft3, comprobantes_pago_qvmxj0e, comprobantes_pago_wub2gol, comprobantes_pago_ystfzq6 [EXTRACTED 1.00]

## Communities (69 total, 63 thin omitted)

### Community 0 - "Payment Comprobante Uploads"
Cohesion: 0.21
Nodes (17): Bank Transfer Payment Type, Comprobantes Media Directory, Payment Receipt (pago.png), Payment Receipt (pago_3IWNz0a.png), Payment Receipt (pago_fdOMxeu.png), Payment Receipt (pago_ftBN1Zy.png), Payment Receipt (pago_iuWjgEz.png), Payment Receipt (pago_jPY1FT3.png) (+9 more)

### Community 1 - "HR & Task Queue Setup"
Cohesion: 0.17
Nodes (12): Importar Docentes desde Excel - Guide, rrhh.Empleado Model, import_docentes_final.py Script, django-celery-beat 2.9.0 Dependency, Celery 5.6.3 Dependency, octopus-api Python Dependencies, Django 6.0.4 Dependency, Django REST Framework 3.17.1 Dependency (+4 more)

### Community 2 - "Frontend Brand Assets"
Cohesion: 0.32
Nodes (8): Hero Image - Abstract 3D Layered Cube (Purple/Violet Theme), School Logo - U.E. Colegio Los Hijos de Maria Auxiliadora, Yaracal, Edo. Falcon, React Logo SVG - Official React Atom Icon (Cyan #00D8FF), Vite Logo SVG - Official Vite Lightning Bolt (Purple #9135ff), Octopus Frontend Brand Identity, Favicon PNG - School Crest (Maria Auxiliadora), Favicon SVG - Vite Lightning Bolt Brand Icon (Purple), Social Icons SVG Sprite (Bluesky, Discord, GitHub, X, Documentation, Social)

### Community 3 - "Cobranza Email Notifications"
Cohesion: 0.36
Nodes (8): Base Email HTML Template, Bienvenida Portal Email Template, Automated Debt Collection Notification Flow, Mora Dia 0 - Factura Generada Email Template, Mora Dia 10 - Segundo Aviso Email Template, Mora Dia 15 - Alerta Director Email Template, Mora Dia 5 - Primer Recordatorio Email Template, Pago Exitoso Confirmation Email Template

### Community 4 - "Celery Worker Configuration"
Cohesion: 0.43
Nodes (8): Celery Beat Scheduler, Celery Worker Process, cobranza/celery.py - Legacy Celery Instance, config/celery.py - Canonical Celery Instance, Arranque Celery - Setup Guide, Redis Message Broker, Supervisor Process Manager, Systemd Service Manager

### Community 5 - "Technical Debt Registry"
Cohesion: 0.38
Nodes (7): Accessibility WCAG 2.1 AA Technical Debt, Auth/ApiClient Technical Debt, Morosos N+1 Query Technical Debt, MultiSede Dashboard Technical Debt, JWT Refresh Logic Duplication Debt, Portal Token localStorage Security Debt, NOTAS_TECNICAS - Technical Debt Document

## Knowledge Gaps
- **75 isolated node(s):** `DatePickerES`, `EmpleadoForm`, `EmpleadoModal`, `ReciboModal`, `cell_` (+70 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **63 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Celery Beat Scheduler` connect `Celery Worker Configuration` to `HR & Task Queue Setup`, `Cobranza Email Notifications`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `Automated Debt Collection Notification Flow` connect `Cobranza Email Notifications` to `Celery Worker Configuration`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `Bank Transfer Payment Type` (e.g. with `Payment Proof Upload Flow` and `Payment Receipt (pago.png)`) actually correct?**
  _`Bank Transfer Payment Type` has 14 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `Octopus Frontend Brand Identity` (e.g. with `Hero Image - Abstract 3D Layered Cube (Purple/Violet Theme)` and `School Logo - U.E. Colegio Los Hijos de Maria Auxiliadora, Yaracal, Edo. Falcon`) actually correct?**
  _`Octopus Frontend Brand Identity` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Celery Beat Scheduler` (e.g. with `Automated Debt Collection Notification Flow` and `django-celery-beat 2.9.0 Dependency`) actually correct?**
  _`Celery Beat Scheduler` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `DatePickerES`, `EmpleadoForm`, `EmpleadoModal` to the rest of the system?**
  _78 weakly-connected nodes found - possible documentation gaps or missing edges._