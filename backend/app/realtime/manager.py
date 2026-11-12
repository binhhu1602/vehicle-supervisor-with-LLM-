"""Quản lý kết nối WebSocket và phát sự kiện tới mọi client (Observer của EventBus)."""

import asyncio
import json
import logging
from dataclasses import dataclass

from fastapi import WebSocket

log = logging.getLogger("trafficeye.ws")


@dataclass(eq=False)
class Client:
    ws: WebSocket
    user: dict


class ConnectionManager:
    def __init__(self) -> None:
        self.clients: set[Client] = set()

    def add(self, client: Client) -> None:
        self.clients.add(client)
        log.info("WS kết nối: %s (%d client)", client.user["username"], len(self.clients))

    def remove(self, client: Client) -> None:
        self.clients.discard(client)

    @staticmethod
    async def send(client: Client, type_: str, payload) -> None:
        await client.ws.send_text(json.dumps({"type": type_, "payload": payload}, ensure_ascii=False))

    async def broadcast(self, type_: str, payload) -> None:
        if not self.clients:
            return
        message = json.dumps({"type": type_, "payload": payload}, ensure_ascii=False)

        async def _send(c: Client):
            try:
                await asyncio.wait_for(c.ws.send_text(message), timeout=5)
            except Exception:
                self.remove(c)  # client chậm/mất kết nối không làm nghẽn các client khác

        await asyncio.gather(*(_send(c) for c in list(self.clients)))
