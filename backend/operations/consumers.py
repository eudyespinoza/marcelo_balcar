from channels.generic.websocket import AsyncJsonWebsocketConsumer


class OperationsConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        if not self.scope["user"].is_authenticated:
            await self.close(code=4401)
            return
        await self.channel_layer.group_add("operations", self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard("operations", self.channel_name)

    async def service_change(self, event):
        await self.send_json({key: value for key, value in event.items() if key != "type"})

