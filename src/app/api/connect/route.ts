import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from "../../actions" ; // Import from actions
import { DatabaseConfig } from "../../database"; // Import DatabaseConfig from database.ts

export async function POST(request: NextRequest) {
  try {
    const config: DatabaseConfig = await request.json();
    const result = await connectToDatabase(config); // Call the server action
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('API Connect Error:', error); // Log API error
    const errorMessage = error instanceof Error ? error.message : String(error); // Type narrowing
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 }); // Return formatted error
  }
}