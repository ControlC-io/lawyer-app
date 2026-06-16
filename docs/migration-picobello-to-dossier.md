# Migración: PicoBello → Lawyer App

## Contexto

**Lawyer App** es un fork de **PicoBello** (plataforma genérica de gestión documental con OCR y workflows) recortado y reenfocado exclusivamente en gestión documental para despachos de abogados.

El tenant de referencia es **ControlC** (`company_id: d2b1b417-7748-43e3-828b-678f572f488b`).

---

## Qué se eliminó de PicoBello

### Backend
| Eliminado | Motivo |
|---|---|
| Workflows y triggers (Trigger.dev) | Fuera de scope |
| API keys públicas por organización | Fuera de scope |
| `migrate-multiple-files.ts` | Script obsoleto |
| `workflowUserField.ts`, `promptTemplate.ts`, `externalLinkExpiry.ts` | Dependían de workflows |
| Tests (`backend/src/tests/*.test.ts`) | Ligados a features eliminadas |
| `docs/trigger-setup.md`, `docs/openapi.yaml` | Obsoletos |

### Frontend
| Eliminado / Simplificado | Motivo |
|---|---|
| Tab "API" en Organization Settings | Sin API keys públicas |
| Lógica "Request a Demo" en `NoOrganization.tsx` y `Auth.tsx` | No aplica para uso interno |
| Feedback en sidebar (`FeedbackDialog`) y API pública `/feedback`, `/demo-request` | No aplica para uso interno |
| Páginas/rutas de workflow | Fuera de scope |

---

## Qué se añadió / modificó

### Nuevo modelo de datos: `Person`

```prisma
model Person {
  id        String   @id @default(uuid())
  name      String
  companyId String
  folderId  String?  @unique   // carpeta raíz de sus documentos
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company   Company  @relation(fields: [companyId], references: [id])
  folder    Folder?  @relation(fields: [folderId], references: [id])
}
```

Cada `Person` tiene una **carpeta raíz** en MinIO donde se almacenan todos sus documentos.

### Tipos de documento

Se reutiliza el modelo `DocumentSplitPreset` (ya existía en PicoBello) como "tipos de documento". Cada tipo es un preset de split PDF con metadatos predefinidos.

### Metadata keys

Se reutiliza `FilesMetadataKey`. Las claves del tenant ControlC son:
- **Année** — año del documento (texto libre)
- **Mois** — mes (`01`–`12`)
- **Type** — tipo de documento — **sincronizado automáticamente** desde `DocumentSplitPreset`
- **Personne** — nombre de la persona — **sincronizado automáticamente** desde `Person`

Las claves "Type" y "Personne" se mantienen en sync: cuando se crea, renombra o borra un documento tipo o persona, sus `allowed_values` se actualizan automáticamente. Así la IA siempre tiene la lista correcta al sugerir el split.

### Nuevas páginas frontend

| Ruta | Componente | Descripción |
|---|---|---|
| `/persons` | `Persons.tsx` | Lista y gestión de personas |
| `/persons/:personId/documents` | `DocumentManagement.tsx` | Documentos de una persona |
| `/document-types` | `DocumentTypes.tsx` | Gestión de tipos de documento (presets) |
| `/metadata-keys` | `MetadataKeys.tsx` | Gestión de metadata keys (extraído de Organization Settings) |

### Cambios en rutas existentes

- `/split-pdf` — añadido selector de persona y presets de tipo de documento
- `/documents` — integrado selector de persona y tipo de documento en `MetadataDocumentView`
- `/organization-settings` — eliminado tab "API", simplificado a "General" + "Branding"

---

## Datos semilla (tenant ControlC)

Ejecutado via `scripts/seed-data.js` (Node.js directo a PostgreSQL, sin Docker CLI):

- **3 metadata keys**: Année, Mois, Type
- **11 tipos de documento**: Facture, Contrat, Attestation, Déclaration, Formulaire, Acte notarié, Déclaration de succession, Demande de renseignements, Informations, Extrait bancaire, Autre
- **144 personas** con carpeta raíz cada una

---

## Configuración de entorno

### Modo Docker (producción / normal)

```env
DATABASE_URL=postgresql://postgres:postgres@db:5432/lawyer_app_db
MINIO_ENDPOINT=minio
VITE_API_URL=          # vacío — Vite proxea /api → backend vía nginx
```

Comandos:
```bash
docker compose up -d
# App en http://localhost:3000
```

### Modo local (dev sin Docker para frontend/backend)

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lawyer_app_db
MINIO_ENDPOINT=localhost
VITE_API_URL=http://127.0.0.1:3001
```

**IMPORTANTE (Windows ARM64):** Hay dos Node.js en esta máquina:
- `C:\nvm4w\nodejs\node.exe` → **x64** (emulado) — usa este para la app
- Node de Cursor → ARM64 nativo — NO usar para la app (los binarios nativos son x64)

```powershell
# Solo DB y MinIO en Docker
docker compose up -d db minio

# Backend local (usar node x64 de nvm4w)
cd backend
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lawyer_app_db"
$env:MINIO_ENDPOINT="localhost"
& "C:\nvm4w\nodejs\node.exe" "C:\nvm4w\nodejs\node_modules\ts-node\dist\bin.js" --transpile-only src/index.ts

# Frontend local (en otra terminal, desde la raíz)
$env:VITE_API_URL="http://127.0.0.1:3001"
& "C:\nvm4w\nodejs\node.exe" "C:\nvm4w\nodejs\node_modules\npm\bin\npm-cli.js" run dev -w frontend
# → http://localhost:3000 (o siguiente puerto libre)
```

Script conveniente: `.\scripts\dev-local.ps1`

---

## APIs externas

| Servicio | Variable | Uso |
|---|---|---|
| Mistral OCR | `OCR_API_KEY` | Extrae texto de PDFs antes del split |
| Google Gemini | `GEMINI_API_KEY` + `GEMINI_MODEL` | Sugiere rangos de páginas para split |

Modelo Gemini actual: **`gemini-2.5-flash`** (actualizado desde `gemini-2.0-flash` deprecado en junio 2026).

---

## Problemas conocidos de entorno (Windows ARM64)

| Problema | Causa | Solución |
|---|---|---|
| `docker compose` falla con pipe error | Docker Desktop pierde la conexión del pipe Linux | Reiniciar Docker Desktop; en casos extremos, reiniciar el PC |
| Prisma engine incompatible | Binario `query_engine-windows.dll.node` es x64, Node ARM64 no lo carga | Usar el node x64 de nvm4w para correr el backend |
| Rollup / SWC fallan en local | Binarios nativos instalados para Linux (dentro de Docker) | `npm install @rollup/rollup-win32-arm64-msvc --force` + `npm install @swc/core-win32-arm64-msvc --force` |
| Variables de shell sobreescriben `.env` | PowerShell mantiene `$env:DATABASE_URL` entre sesiones | `Remove-Item Env:DATABASE_URL` antes de `docker compose up` |
| `sh` no reconocido en Windows | `migrate.sh` usa bash | Reemplazado por `backend/scripts/migrate.js` (Node.js) |

---

## Credenciales locales

- **URL**: http://localhost:3000
- **Email**: jose.segura@controlc.io
- **Contraseña**: Holahola12
- **Organización**: ControlC
