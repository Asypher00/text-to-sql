import { NextRequest, NextResponse } from 'next/server';
import { message } from "../../actions" ; // Import from actions
import { StoredMessage } from '@langchain/core/messages';

export async function POST(request: NextRequest) {
  try {
    const { messages }: { messages: StoredMessage[] } = await request.json();
    const result = await message(messages); // Call the server action
    return NextResponse.json({ result });
  } catch (error: any) {
    console.error('API Message Error:', error); // Log API error
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}