import { useEffect, useState, useRef } from 'react';
import { MCP } from './mcp_core';

/**
 * Hook for initializing MCP server
 * @param {Array} tools Array of tools to register
 * @param {Array} resources Array of resources to register
 * @param {boolean} debug Enable debug logging
 */
export const useMCPServer = (tools = [], resources = [], debug = false) => {
  const [server, setServer] = useState(null);
  const serverRef = useRef(null);

  useEffect(() => {
    const instance = MCP.createServer(window, debug);
    serverRef.current = instance;
    setServer(instance);

    return () => {
      if (typeof instance.destroy === 'function') {
        instance.destroy();
      }
      serverRef.current = null;
      setServer(null);
    };
  }, [debug]);

  useEffect(() => {
    const instance = serverRef.current;
    if (!instance) return;

    if (typeof instance.clearTools === 'function') instance.clearTools();
    if (typeof instance.clearResources === 'function') instance.clearResources();

    (tools || []).forEach(tool => {
      instance.registerTool({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
        handler: tool.handler
      });
    });

    (resources || []).forEach(resource => {
      instance.registerResource({
        uri: resource.uri,
        name: resource.name,
        title: resource.title,
        description: resource.description,
        mimeType: resource.mimeType,
        size: resource.size,
        annotations: resource.annotations,
        handler: resource.handler
      });
    });
  }, [tools, resources, server]);

  return server;
};
