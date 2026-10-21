# Home concepts

## An aggregate, not another data owner

HomeService assembles the current owner's public user, workspaces, projects, active tasks, and active notes. It calls the owning services; it has no repository and does not import adapters or database tables. This keeps future permission/data-shape changes at the service that owns each record.

The public `/v1/home` contract is unchanged by the modularization. The controller supplies the authenticated public identity, and the service fans out the four independent service reads. Each owning service enforces the owner scope; Home cannot request another user's ID from a query/body parameter.

## Scope of aggregation

This is a personal account snapshot, not an AI prompt and not authorization to merge workspace context. The web client derives My Day, Upcoming, Waiting On, and authorized search from that snapshot. Server-side pagination/search and a revision cursor are future contract work; the current full snapshot is not advertised as an unlimited-scale sync feed.

Reads are independent, as in the baseline implementation, rather than a single serializable snapshot. A concurrent write can become visible on the next refresh. It does not weaken write revision checks or owner isolation.
