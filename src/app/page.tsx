"use client"
import { useState, useEffect, useRef } from "react";
import {
  HumanMessage,
  BaseMessage,
  AIMessage,
  mapChatMessagesToStoredMessages
} from "@langchain/core/messages"

// Define types locally since we're no longer importing from actions
interface DatabaseConfig {
  server: string;
  database: string;
  user: string;
  password: string;
  port: number;
  options: {
    encrypt: boolean;
    trustServerCertificate: boolean;
  };
}

interface ConnectionResult {
  success: boolean;
  message: string;
  schema?: string;
}

interface ConnectionStatus {
  connected: boolean;
  database?: string;
  server?: string;
}

interface MessageResponse {
  result: string;
}

// Updated StoredMessage interface to match LangChain's structure
interface StoredMessage {
  type: string;
  data: {
    content: string;
    additional_kwargs?: Record<string, any>;
    response_metadata?: Record<string, any>;
  };
}

// API helper functions
const connectToDatabaseAPI = async (config: DatabaseConfig): Promise<ConnectionResult> => {
  const response = await fetch('/api/connect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Connection failed');
  }

  return response.json();
};

const sendMessageAPI = async (messages: StoredMessage[]): Promise<MessageResponse> => {
  const response = await fetch('/api/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Message failed');
  }

  return response.json();
};

const getDbConnectionStatusAPI = async (): Promise<ConnectionStatus> => {
  const response = await fetch('/api/connection', {
    method: 'GET',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get connection status');
  }

  return response.json();
};

const disconnectFromDatabaseAPI = async (): Promise<ConnectionResult> => {
  const response = await fetch('/api/connection', {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Disconnection failed');
  }

  return response.json();
};

export default function Home() {
  const [inputMessage, setInputMessage] = useState("")
  const [messages, setMessages] = useState<BaseMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showConnectionModal, setShowConnectionModal] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [dbConfig, setDbConfig] = useState<DatabaseConfig>({
    server: '',
    database: '',
    user: '',
    password: '',
    port: 1433,
    options: {
      encrypt: true,
      trustServerCertificate: true
    }
  })
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ connected: false })

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Check connection status on component mount
  useEffect(() => {
    checkConnectionStatus();
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const checkConnectionStatus = async () => {
    try {
      const status = await getDbConnectionStatusAPI();
      setConnectionStatus(status);
    } catch (error: unknown) {
      console.error('Error checking connection status:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Error checking connection status: ${errorMessage}`);
    }
  }

  const handleConnect = async () => {
    if (!dbConfig.server || !dbConfig.database || !dbConfig.user || !dbConfig.password) {
      alert('Please fill in all required fields');
      return;
    }

    setIsConnecting(true);
    try {
      const result = await connectToDatabaseAPI(dbConfig);
      
      if (result.success) {
        setShowConnectionModal(false);
        await checkConnectionStatus();
        
        // Add system message about successful connection
        const connectionMessage = new AIMessage(
          `✅ ${result.message}\n\n${result.schema ? `📊 **Database Schema Information:**\n\`\`\`\n${result.schema}\n\`\`\`` : ''}\n\n🚀 You can now ask questions about your data in natural language!\n\n**Example questions you can ask:**\n- "Show me all tables in this database"\n- "What are the first 10 records from [table_name]?"\n- "How many records are in each table?"\n- "Show me the structure of [table_name]"`
        );
        setMessages(prev => [...prev, connectionMessage]);
      } else {
        alert(`❌ Connection failed: ${result.message}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`❌ Connection failed: ${errorMessage}`);
    }
    setIsConnecting(false);
  }

  const handleDisconnect = async () => {
    try {
      const result = await disconnectFromDatabaseAPI();
      if (result.success) {
        await checkConnectionStatus();
        const disconnectMessage = new AIMessage(`🔌 ${result.message}`);
        setMessages(prev => [...prev, disconnectMessage]);
      }
    } catch (error: unknown) {
      console.error('Error disconnecting:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Error disconnecting: ${errorMessage}`);
    }
  }

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;
    
    const userMessage = inputMessage;
    setInputMessage("");
    setIsLoading(true);
    
    const messageHistory = [...messages, new HumanMessage(userMessage)];
    setMessages(messageHistory);

    try {
      const response = await sendMessageAPI(mapChatMessagesToStoredMessages(messageHistory));
      if (response && response.result) {
        messageHistory.push(new AIMessage(response.result));
        setMessages(messageHistory);
      } else {
        throw new Error("No valid response received from AI.");
      }
    } catch (error: unknown) {
      console.error('Error sending message:', error);
      const errorMessageText = error instanceof Error ? error.message : String(error);
      const errorMessage = new AIMessage(`❌ Error: ${errorMessageText}`);
      setMessages([...messageHistory, errorMessage]);
    }

    setIsLoading(false);
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && connectionStatus.connected && inputMessage.trim()) {
        sendMessage();
      }
    }
  }

  const clearMessages = () => {
    setMessages([]);
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50" style={{color: "black"}}>
      {/* Header */}
      <header className="bg-white shadow-sm border-b p-4">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <div className="flex items-center space-x-4">
            <div className="bg-blue-600 text-white p-2 rounded-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 1.79 4 4 4h8c2.21 0 4-1.79 4-4V7M4 7c0-2.21 1.79-4 4-4h8c2.21 0 4 1.79 4 4M4 7h16" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">SQL Server Assistant</h1>
              <p className="text-sm text-gray-600">Natural language to SQL queries</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-sm">
              <span className="text-gray-600">Status:</span>
              <span className={`ml-2 px-3 py-1 rounded-full text-xs font-medium ${
                connectionStatus.connected 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {connectionStatus.connected 
                  ? `Connected: ${connectionStatus.database}@${connectionStatus.server}` 
                  : 'Not Connected'
                }
              </span>
            </div>
            
            <div className="flex space-x-2">
              {connectionStatus.connected && (
                <>
                  <button
                    onClick={clearMessages}
                    className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-2 rounded-lg text-sm transition-colors"
                    title="Clear conversation"
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm transition-colors"
                  >
                    Disconnect
                  </button>
                </>
              )}
              <button
                onClick={() => setShowConnectionModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                {connectionStatus.connected ? 'Change Connection' : 'Connect Database'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto">
          {!connectionStatus.connected && messages.length === 0 && (
            <div className="text-center py-12">
              <div className="bg-white rounded-lg shadow-sm p-8 border">
                <div className="bg-blue-100 rounded-full p-3 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 1.79 4 4 4h8c2.21 0 4-1.79 4-4V7M4 7c0-2.21 1.79-4 4-4h8c2.21 0 4 1.79 4 4M4 7h16" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to SQL Server Assistant</h2>
                <p className="text-gray-600 mb-6">Connect to your SQL Server database and start asking questions in natural language.</p>
                <button
                  onClick={() => setShowConnectionModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  Connect to Database
                </button>
              </div>
            </div>
          )}
          
          {messages.map((msg, index) => {
            if (msg instanceof HumanMessage) {
              return (
                <div key={index} className="mb-6">
                  <div className="flex items-start justify-end">
                    <div className="bg-blue-600 text-white p-4 rounded-lg max-w-3xl shadow-sm">
                      <div className="whitespace-pre-wrap break-words">{msg.content as string}</div>
                    </div>
                    <div className="ml-3 flex-shrink-0">
                      <div className="bg-blue-600 text-white rounded-full p-2">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            if (msg instanceof AIMessage) {
              return (
                <div key={index} className="mb-6">
                  <div className="flex items-start">
                    <div className="mr-3 flex-shrink-0">
                      <div className="bg-green-600 text-white rounded-full p-2">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 717 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-lg max-w-3xl shadow-sm border">
                      <div className="whitespace-pre-wrap break-words prose prose-sm max-w-none">
                        {(msg.content as string).split('\n').map((line, i) => {
                          if (line.startsWith('```')) {
                            return null;
                          }
                          if (line.includes('**') && line.includes('**')) {
                            return (
                              <div key={i} className="font-semibold mb-2">
                                {line.replace(/\*\*(.*?)\*\*/g, '$1')}
                              </div>
                            );
                          }
                          if (line.startsWith('- ')) {
                            return (
                              <div key={i} className="ml-4 mb-1">
                                {line}
                              </div>
                            );
                          }
                          return line ? <div key={i} className="mb-2">{line}</div> : <br key={i} />;
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })}
          
          {isLoading && (
            <div className="mb-6">
              <div className="flex items-start">
                <div className="mr-3 flex-shrink-0">
                  <div className="bg-green-600 text-white rounded-full p-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 717 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span className="text-gray-600">Processing your query...</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex space-x-4">
            <div className="flex-1">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  connectionStatus.connected 
                    ? "Ask questions about your database in natural language..." 
                    : "Please connect to a database first"
                }
                disabled={!connectionStatus.connected || isLoading}
                className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                rows={3}
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={!connectionStatus.connected || isLoading || !inputMessage.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg transition-colors self-end"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Connection Modal */}
      {showConnectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Database Connection</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Server</label>
                <input
                  type="text"
                  value={dbConfig.server}
                  onChange={(e) => setDbConfig({...dbConfig, server: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="localhost or server address"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Database</label>
                <input
                  type="text"
                  value={dbConfig.database}
                  onChange={(e) => setDbConfig({...dbConfig, database: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Database name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={dbConfig.user}
                  onChange={(e) => setDbConfig({...dbConfig, user: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Username"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={dbConfig.password}
                  onChange={(e) => setDbConfig({...dbConfig, password: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Password"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                <input
                  type="number"
                  value={dbConfig.port}
                  onChange={(e) => setDbConfig({...dbConfig, port: parseInt(e.target.value)})}
                  className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="1433"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowConnectionModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                disabled={isConnecting}
              >
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded transition-colors"
              >
                {isConnecting ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}