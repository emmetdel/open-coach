import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processUserMessage } from '$lib/server/coach';
import { getChatHistory } from '$lib/server/db';

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        const db = locals.db;
        if (!db) {
            return json({ error: 'Database not available' }, { status: 500 });
        }

        const { message } = await request.json();
        
        if (!message) {
            return json({ error: 'Message is required' }, { status: 400 });
        }

        const response = await processUserMessage(db, message);
        return json({ response });

    } catch (error: any) {
        console.error('Chat API Error:', error);
        return json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
};

export const GET: RequestHandler = async ({ locals }) => {
    try {
        const db = locals.db;
        if (!db) {
            return json({ error: 'Database not available' }, { status: 500 });
        }

        const history = await getChatHistory(db, 50);
        return json({ 
            history: history.map(msg => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                createdAt: msg.created_at
            }))
        });
    } catch (error: any) {
        return json({ error: error.message }, { status: 500 });
    }
};
