const { structuralDefault } = require('../../lib');

const structuralParkRules = {
  parks: {
    name: structuralDefault,
    region: structuralDefault,
    openedAt: structuralDefault,
    latitude: structuralDefault,
    amenities: structuralDefault,
    facilities: structuralDefault,
    active: structuralDefault,
    createdAt: structuralDefault,
    wardenId: structuralDefault,
  },
  pitches: {
    id: structuralDefault,
    parkId: structuralDefault,
    reference: structuralDefault,
    areaSqm: structuralDefault,
    hasElectricity: structuralDefault,
  },
  owners: {
    id: structuralDefault,
    fullName: structuralDefault,
    email: structuralDefault,
    memberSince: structuralDefault,
    loyaltyPoints: structuralDefault,
    referredByOwnerId: structuralDefault,
  },
  holidayHomes: {
    id: structuralDefault,
    pitchId: structuralDefault,
    ownerId: structuralDefault,
    previousOwnerId: structuralDefault,
    model: structuralDefault,
    purchasePrice: structuralDefault,
    specification: structuralDefault,
    inspectedAt: structuralDefault,
  },
  accessories: {
    id: structuralDefault,
    holidayHomeId: structuralDefault,
    description: structuralDefault,
    quantity: structuralDefault,
  },
  lettings: {
    holidayHomeId: structuralDefault,
    guestName: structuralDefault,
    status: structuralDefault,
    startDate: structuralDefault,
    endDate: structuralDefault,
    arrivalTime: structuralDefault,
    siteFee: structuralDefault,
    notes: structuralDefault,
  },
  parkOwners: {
    parkId: structuralDefault,
    ownerId: structuralDefault,
  },
  staff: {
    id: structuralDefault,
    parkId: structuralDefault,
    fullName: structuralDefault,
  },
};

const everyParkTableCounted = {
  parks: 1,
  pitches: 1,
  owners: 1,
  holidayHomes: 1,
  accessories: 1,
  lettings: 1,
  parkOwners: 1,
  staff: 1,
};

module.exports = { everyParkTableCounted, structuralParkRules };
