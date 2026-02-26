using Curling.Hubs;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenAnyIP(8008);
});

builder.Services.AddSignalR();
builder.Services.AddSingleton<MultiplayerRoomManager>();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapHub<MultiplayerHub>("/multiplayer");

app.Run();
