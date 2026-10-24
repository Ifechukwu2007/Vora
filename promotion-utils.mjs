export function placeOneSponsoredService(services, sponsoredServiceIds, options = {}) {
    const ordered = [...services];
    const { preserveOrder = false, allowSponsored = true } = options;
    if (!allowSponsored) return { services: ordered, sponsoredServiceId: null };

    const sponsoredIndex = ordered.findIndex((service) => sponsoredServiceIds.has(String(service.id)));
    if (sponsoredIndex < 0) return { services: ordered, sponsoredServiceId: null };

    const sponsoredServiceId = String(ordered[sponsoredIndex].id);
    if (preserveOrder || sponsoredIndex <= 2) {
        return { services: ordered, sponsoredServiceId };
    }

    const [sponsoredService] = ordered.splice(sponsoredIndex, 1);
    ordered.splice(2, 0, sponsoredService);
    return { services: ordered, sponsoredServiceId };
}