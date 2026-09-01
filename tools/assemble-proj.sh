#!/usr/bin/env bash
# Assemble the model-generated todo app and prove it compiles (tsc) + builds.
set -e
APP=/tmp/todo-proj
rm -rf $APP && mkdir -p $APP/src/app/api/tasks/\[id\] $APP/src/lib $APP/src/app/board $APP/src/app/stats
cd $APP

cat > package.json <<'EOF'
{
  "name": "bhaskara-todo", "version": "0.1.0", "private": true,
  "scripts": { "build": "next build" },
  "dependencies": {
    "better-sqlite3": "^11.10.0",
    "next": "15.4.6",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tailwindcss": "^4.0.0",
    "typescript": "^5"
  }
}
EOF

cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true, "skipLibCheck": true, "strict": true, "noEmit": true,
    "esModuleInterop": true, "module": "esnext", "moduleResolution": "bundler",
    "resolveJsonModule": true, "isolatedModules": true, "jsx": "preserve",
    "incremental": true, "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

cat > next.config.ts <<'EOF'
import type { NextConfig } from "next";
const nextConfig: NextConfig = { serverExternalPackages: ["better-sqlite3"] };
export default nextConfig;
EOF

cat > postcss.config.mjs <<'EOF'
export default { plugins: { "@tailwindcss/postcss": {} } };
EOF

echo '@import "tailwindcss";' > src/app/globals.css

# turn -> destination; later turns overwrite earlier (refactor turns supersede)
place() { [ -f /tmp/proj-out/turn$1.txt ] && cp /tmp/proj-out/turn$1.txt "$2" && echo "  turn$1 → $2" || echo "  MISSING turn$1 → $2"; }
place 02 src/lib/db.ts
place 03 src/lib/types.ts
place 15 src/lib/format.ts
place 13 src/app/api/tasks/route.ts          # batch-writes refactor supersedes turn04
place 05 "src/app/api/tasks/[id]/route.ts"
place 06 src/app/board/page.tsx
place 12 src/app/board/page.tsx              # windowed-sort refactor supersedes turn06
place 07 src/app/board/TaskCard.tsx
place 14 src/app/board/TaskCard.tsx          # optimistic-concurrency fix supersedes turn07
place 08 src/app/stats/page.tsx
place 09 src/app/page.tsx
place 10 src/app/layout.tsx

echo "--- bun install:"
bun install 2>&1 | tail -2
echo "--- tsc --noEmit:"
bunx tsc --noEmit 2>&1 | head -40
echo "TSC_EXIT=$?"