import { describe, expect, it } from "vitest";
import { createServer as createHttpServer, type Server as HttpServer } from "../polyfills/http";
import {
  createConnection,
  createServer as createNetServer,
  type TcpServer,
  type TcpSocket,
} from "../polyfills/net";

describe("listen/connect callback receiver parity", () => {
  it("binds a net.Server listen callback to the server", async () => {
    const server = createNetServer();

    await new Promise<void>((resolve) => {
      server.listen(0, function (this: TcpServer) {
        expect(this).toBe(server);
        expect(this.address()?.port).toBeGreaterThan(0);
        server.close();
        resolve();
      });
    });
  });

  it("binds an http.Server listen callback to the HTTP server", async () => {
    const server = createHttpServer((_req, res) => {
      res.end("ok");
    });

    await new Promise<void>((resolve) => {
      server.listen(0, function (this: HttpServer) {
        expect(this).toBe(server);
        expect(this.address()?.port).toBeGreaterThan(0);
        server.close();
        resolve();
      });
    });
  });

  it("binds a net.Socket connect callback to the socket", async () => {
    const socket = createConnection(4173, function (this: TcpSocket) {
      expect(this).toBe(socket);
      expect(this.remotePort).toBe(4173);
      socket.destroy();
    });

    await new Promise<void>((resolve) => socket.once("close", resolve));
  });
});
