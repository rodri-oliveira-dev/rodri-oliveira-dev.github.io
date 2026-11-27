using System.Collections.Concurrent;
using Notifications.Functions.Push;

namespace Notifications.Functions.Tests.Push;

internal sealed class InMemoryCampaignDocumentStore : ICampaignDocumentStore
{
    private readonly ConcurrentDictionary<string, (object Document, long Version)> _items = new(StringComparer.Ordinal);

    public bool FailDeliveryReplacements { get; set; }

    public IReadOnlyList<CampaignDeliveryDocument> Deliveries => _items.Values
        .Select(value => value.Document)
        .OfType<CampaignDeliveryDocument>()
        .ToArray();

    public IReadOnlyList<CampaignDocument> Campaigns => _items.Values
        .Select(value => value.Document)
        .OfType<CampaignDocument>()
        .ToArray();

    public Task<CampaignWriteResult> CreateCampaignAsync(CampaignDocument document, CancellationToken cancellationToken) =>
        Task.FromResult(Create(Key(document.PartitionKey, document.Id), document));

    public Task<StoredCampaignDocument?> ReadCampaignAsync(string id, string partitionKey, CancellationToken cancellationToken)
    {
        return Task.FromResult(_items.TryGetValue(Key(partitionKey, id), out var value) && value.Document is CampaignDocument document
            ? new StoredCampaignDocument(document, ETag(value.Version), 1)
            : null);
    }

    public Task<CampaignWriteResult> CreateDeliveryAsync(CampaignDeliveryDocument document, CancellationToken cancellationToken) =>
        Task.FromResult(Create(Key(document.PartitionKey, document.Id), document));

    public Task<StoredDelivery?> ReadDeliveryAsync(string id, string partitionKey, CancellationToken cancellationToken)
    {
        return Task.FromResult(_items.TryGetValue(Key(partitionKey, id), out var value) && value.Document is CampaignDeliveryDocument document
            ? new StoredDelivery(document, ETag(value.Version), 1)
            : null);
    }

    public Task<CampaignWriteResult> ReplaceDeliveryAsync(
        CampaignDeliveryDocument document,
        string expectedETag,
        CancellationToken cancellationToken)
    {
        if (FailDeliveryReplacements)
        {
            throw new InvalidOperationException("simulated persistence failure");
        }

        var key = Key(document.PartitionKey, document.Id);
        while (_items.TryGetValue(key, out var existing))
        {
            if (ETag(existing.Version) != expectedETag)
            {
                return Task.FromResult(new CampaignWriteResult(CampaignWriteStatus.Conflict, null, 1));
            }

            var replacement = (Document: (object)document, Version: existing.Version + 1);
            if (_items.TryUpdate(key, replacement, existing))
            {
                return Task.FromResult(new CampaignWriteResult(CampaignWriteStatus.Updated, ETag(replacement.Version), 1));
            }
        }

        return Task.FromResult(new CampaignWriteResult(CampaignWriteStatus.NotFound, null, 1));
    }

    private CampaignWriteResult Create(string key, object document)
    {
        return _items.TryAdd(key, (document, 1))
            ? new(CampaignWriteStatus.Created, ETag(1), 1)
            : new(CampaignWriteStatus.Duplicate, null, 1);
    }

    private static string Key(string partitionKey, string id) => $"{partitionKey}\n{id}";
    private static string ETag(long version) => $"etag-{version}";
}
