/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = 'https://mruhnsragtbbrgfyuogu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ydWhuc3JhZ3RiYnJnZnl1b2d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4NzMxMjAsImV4cCI6MjA4NTQ0OTEyMH0.p0dCAwUV3dwYfDEJr9RxbeDJWrx6_G9rAsvQJ0zcsaY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    console.log('Testing connection to Supabase...');
    try {
        // Attempt to fetch session - simple way to check if client works
        const { error } = await supabase.auth.getSession();

        if (error) {
            console.error('Connection failed with error:', error.message);
            process.exit(1);
        }

        console.log('Successfully connected to Supabase!');
        console.log('Supabase URL is reachable.');

        // Attempt to query a non-existent table to verify DB reachability regarding headers/auth
        // This will likely fail with a 404/400 (relation does not exist) or 200 (empty list) depending on RLS/schema,
        // but getting a "Postgres" response is better than a network timeout.
        const { error: dbError } = await supabase.from('modules_test_connection').select('*').limit(1);

        if (dbError) {
            // If the error code is 'PGRST204' (relation does not exist) or '42P01', it means we are talking to the DB.
            // If it's a network error, it will be different.
            console.log('Database verification response:', dbError.code, dbError.message);
            if (dbError.code === 'PGRST204' || dbError.code === '42P01' || dbError.code === '42501' || !dbError.code) { // 42501 is permission denied (RLS)
                console.log('Confirmed communication with Database.');
            } else {
                console.warn('Warning: Unexpected DB error:', dbError);
            }
        } else {
            console.log('Database query executed successfully (Table might exist or RLS allowed).');
        }

    } catch (err) {
        console.error('Unexpected error:', err);
        process.exit(1);
    }
}

testConnection();
