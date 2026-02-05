// Run migration script for Supabase
// Usage: node run-migration.js

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('Starting database migration...\n');

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'migration_colleges_batches.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Split into individual statements (rough split by semicolon, but keeping DO blocks together)
    const statements = [];
    let currentStatement = '';
    let inDoBlock = false;

    const lines = migrationSQL.split('\n');
    for (const line of lines) {
      // Skip comments
      if (line.trim().startsWith('--')) {
        continue;
      }

      currentStatement += line + '\n';

      // Track DO $$ blocks
      if (line.trim().startsWith('DO $$')) {
        inDoBlock = true;
      }
      if (inDoBlock && line.trim().endsWith('$$;')) {
        inDoBlock = false;
        statements.push(currentStatement.trim());
        currentStatement = '';
        continue;
      }

      // Regular statement ending with semicolon (not in DO block)
      if (!inDoBlock && line.trim().endsWith(';')) {
        statements.push(currentStatement.trim());
        currentStatement = '';
      }
    }

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt || stmt.length < 5) continue;

      // Extract first meaningful line for logging
      const firstLine = stmt.split('\n').find(l => l.trim() && !l.trim().startsWith('--')) || stmt.substring(0, 50);
      console.log(`[${i + 1}/${statements.length}] Executing: ${firstLine.substring(0, 60)}...`);

      const { error } = await supabase.rpc('exec_sql', { sql: stmt }).single();
      
      if (error) {
        // Try direct query for DDL statements
        const { error: directError } = await supabase.from('_migrations_log').select('*').limit(0);
        
        // For real execution, we'll use the REST API directly
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
          method: 'POST',
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: stmt }),
        });

        if (!response.ok) {
          console.log(`  ⚠ Note: ${error?.message || 'Statement may need manual execution'}`);
          errorCount++;
        } else {
          successCount++;
        }
      } else {
        console.log('  ✓ Success');
        successCount++;
      }
    }

    console.log('\n========================================');
    console.log(`Migration completed!`);
    console.log(`Successful: ${successCount}`);
    console.log(`Warnings/Errors: ${errorCount}`);
    console.log('========================================\n');

    console.log('NOTE: If you see errors, please run the migration manually in Supabase SQL Editor:');
    console.log('1. Go to your Supabase Dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy the contents of migration_colleges_batches.sql');
    console.log('4. Paste and Run the SQL');

  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

runMigration();
