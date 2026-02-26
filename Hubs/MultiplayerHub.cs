using Microsoft.AspNetCore.SignalR;

namespace Curling.Hubs;

public class MultiplayerHub(MultiplayerRoomManager roomManager) : Hub
{
    public async Task<RoomCreatedResponse> CreateRoom(string hostColor)
    {
        var room = roomManager.CreateRoom(Context.ConnectionId, hostColor);
        await Groups.AddToGroupAsync(Context.ConnectionId, room.RoomId);
        await Clients.Caller.SendAsync("TimerUpdate", roomManager.GetTimerUpdate(room.RoomId));
        return new RoomCreatedResponse(room.RoomId, room.HostColor, room.StartingColor);
    }

    public async Task JoinRoom(string roomId)
    {
        var joinResult = roomManager.TryJoinRoom(roomId, Context.ConnectionId, out var room);
        if (joinResult != JoinRoomResult.Success)
        {
            throw new HubException(joinResult == JoinRoomResult.AlreadyStarted
                ? "Game already started."
                : "Room not available.");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, roomId);
        await Clients.Caller.SendAsync("RoomJoined", new RoomJoinedResponse(room.RoomId, room.GuestColor, room.StartingColor));
        await Clients.Caller.SendAsync("TimerUpdate", roomManager.GetTimerUpdate(room.RoomId));
        if (!string.IsNullOrEmpty(room.HostConnectionId))
        {
            await Clients.Client(room.HostConnectionId)
                .SendAsync("PlayerJoined", new PlayerJoinedResponse(room.RoomId, room.HostColor, room.GuestColor, room.StartingColor));
        }
    }

    public async Task StartTurn(string roomId, string activeColor)
    {
        var update = roomManager.StartTurn(roomId, activeColor);
        if (update != null)
        {
            await Clients.Group(roomId).SendAsync("TimerUpdate", update);
        }
    }

    public async Task StopTurn(string roomId)
    {
        var update = roomManager.StopTurn(roomId);
        if (update != null)
        {
            await Clients.Group(roomId).SendAsync("TimerUpdate", update);
        }
    }

    public async Task UpdateStoneStates(string roomId, IEnumerable<StoneStateDto> stones)
    {
        await Clients.OthersInGroup(roomId).SendAsync("StoneUpdates", stones);
    }

    public async Task SnapshotStoneStates(string roomId, IEnumerable<StoneStateDto> stones)
    {
        await Clients.OthersInGroup(roomId).SendAsync("StoneSnapshot", stones);
    }

    public async Task CompleteTurn(string roomId, string activeColor, int currentThrowIndex)
    {
        await Clients.Group(roomId).SendAsync("TurnChanged", new TurnChangedResponse(roomId, activeColor, currentThrowIndex));
    }

    public async Task NotifyEndScored(string roomId)
    {
        await Clients.OthersInGroup(roomId).SendAsync("EndScored", new EndScoredResponse(roomId));
    }

    public async Task StartNextEndCountdown(string roomId, int seconds)
    {
        await Clients.Group(roomId).SendAsync("NextEndCountdown", new NextEndCountdownResponse(roomId, seconds));
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        var disconnection = roomManager.HandleDisconnect(Context.ConnectionId);
        if (disconnection != null)
        {
            _ = Clients.Client(disconnection.RemainingConnectionId)
                .SendAsync("GameEnded", new GameEndedResponse(disconnection.RoomId, "opponent-left"));
        }
        return base.OnDisconnectedAsync(exception);
    }
}

public record RoomCreatedResponse(string RoomId, string HostColor, string StartingColor);
public record RoomJoinedResponse(string RoomId, string GuestColor, string StartingColor);
public record PlayerJoinedResponse(string RoomId, string HostColor, string GuestColor, string StartingColor);
public record GameEndedResponse(string RoomId, string Reason);
public record TurnChangedResponse(string RoomId, string ActiveColor, int CurrentThrowIndex);
public record EndScoredResponse(string RoomId);
public record NextEndCountdownResponse(string RoomId, int Seconds);
public record StoneStateDto(string Color, int Number, StoneVector Position, StoneVector Velocity, double RotationRate, double Angle, bool IsLaunched, bool IsOut);
public record StoneVector(double X, double Y);
