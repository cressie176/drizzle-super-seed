import { sql } from 'drizzle-orm';
// AdventureWorks (the lorint/AdventureWorks-for-Postgres port), introspected with drizzle-kit
// pull across its five schemas and repaired by hand, the README's introspection workflow at
// production scale. The repairs, each a documented trap:
//
// - Six domains (Name, Phone, Flag, NameStyle, AccountNumber, OrderNumber) and the money type
//   rendered as unknown(...): now their underlying varchar, boolean and numeric types - 114
//   columns repaired mechanically.
// - 22 nullable xml and bytea columns deleted: omitted columns are never inserted.
// - The one composite foreign key (salesorderdetail -> specialofferproduct) is declared below
//   and recorded by the library: it orders the load and the UNLOGGED file, and its member
//   columns carry explicit rules keeping the pair valid, as
//   CompositeForeignKeyRuleRequiredError would demand of structuralDefault.
import {
  boolean,
  char,
  check,
  date,
  foreignKey,
  integer,
  numeric,
  pgSchema,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const person = pgSchema('person');
export const humanresources = pgSchema('humanresources');
export const production = pgSchema('production');
export const purchasing = pgSchema('purchasing');
export const sales = pgSchema('sales');

export const addressInPerson = person.table(
  'address',
  {
    addressid: serial().primaryKey().notNull(),
    addressline1: varchar({ length: 60 }).notNull(),
    addressline2: varchar({ length: 60 }),
    city: varchar({ length: 30 }).notNull(),
    stateprovinceid: integer().notNull(),
    postalcode: varchar({ length: 15 }).notNull(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.stateprovinceid],
      foreignColumns: [stateprovinceInPerson.stateprovinceid],
      name: 'FK_Address_StateProvince_StateProvinceID',
    }),
  ],
);

export const stateprovinceInPerson = person.table(
  'stateprovince',
  {
    stateprovinceid: serial().primaryKey().notNull(),
    stateprovincecode: char({ length: 3 }).notNull(),
    countryregioncode: varchar({ length: 3 }).notNull(),
    isonlystateprovinceflag: boolean('isonlystateprovinceflag').notNull(),
    name: varchar('name', { length: 50 }).notNull(),
    territoryid: integer().notNull(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.countryregioncode],
      foreignColumns: [countryregionInPerson.countryregioncode],
      name: 'FK_StateProvince_CountryRegion_CountryRegionCode',
    }),
    foreignKey({
      columns: [table.territoryid],
      foreignColumns: [salesterritoryInSales.territoryid],
      name: 'FK_StateProvince_SalesTerritory_TerritoryID',
    }),
  ],
);

export const addresstypeInPerson = person.table('addresstype', {
  addresstypeid: serial().primaryKey().notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const businessentityInPerson = person.table('businessentity', {
  businessentityid: serial().primaryKey().notNull(),
  rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const personInPerson = person.table(
  'person',
  {
    businessentityid: integer().primaryKey().notNull(),
    persontype: char({ length: 2 }).notNull(),
    namestyle: boolean('namestyle').notNull(),
    title: varchar({ length: 8 }),
    firstname: varchar('firstname', { length: 50 }).notNull(),
    middlename: varchar('middlename', { length: 50 }),
    lastname: varchar('lastname', { length: 50 }).notNull(),
    suffix: varchar({ length: 10 }),
    emailpromotion: integer().default(0).notNull(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [businessentityInPerson.businessentityid],
      name: 'FK_Person_BusinessEntity_BusinessEntityID',
    }),
    check('CK_Person_EmailPromotion', sql`(emailpromotion >= 0) AND (emailpromotion <= 2)`),
    check(
      'CK_Person_PersonType',
      sql`(persontype IS NULL) OR (upper((persontype)::text) = ANY (ARRAY['SC'::text, 'VC'::text, 'IN'::text, 'EM'::text, 'SP'::text, 'GC'::text]))`,
    ),
  ],
);

export const contacttypeInPerson = person.table('contacttype', {
  contacttypeid: serial().primaryKey().notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const passwordInPerson = person.table(
  'password',
  {
    businessentityid: integer().primaryKey().notNull(),
    passwordhash: varchar({ length: 128 }).notNull(),
    passwordsalt: varchar({ length: 10 }).notNull(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [personInPerson.businessentityid],
      name: 'FK_Password_Person_BusinessEntityID',
    }),
  ],
);

export const phonenumbertypeInPerson = person.table('phonenumbertype', {
  phonenumbertypeid: serial().primaryKey().notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const countryregionInPerson = person.table('countryregion', {
  countryregioncode: varchar({ length: 3 }).primaryKey().notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const employeeInHumanresources = humanresources.table(
  'employee',
  {
    businessentityid: integer().primaryKey().notNull(),
    nationalidnumber: varchar({ length: 15 }).notNull(),
    loginid: varchar({ length: 256 }).notNull(),
    jobtitle: varchar({ length: 50 }).notNull(),
    birthdate: date().notNull(),
    maritalstatus: char({ length: 1 }).notNull(),
    gender: char({ length: 1 }).notNull(),
    hiredate: date().notNull(),
    salariedflag: boolean('salariedflag').notNull(),
    vacationhours: smallint().default(0).notNull(),
    sickleavehours: smallint().default(0).notNull(),
    currentflag: boolean('currentflag').notNull(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
    organizationnode: varchar().default('/'),
  },
  (table) => [
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [personInPerson.businessentityid],
      name: 'FK_Employee_Person_BusinessEntityID',
    }),
    check(
      'CK_Employee_BirthDate',
      sql`(birthdate >= '1930-01-01'::date) AND (birthdate <= (now() - '18 years'::interval))`,
    ),
    check('CK_Employee_MaritalStatus', sql`upper((maritalstatus)::text) = ANY (ARRAY['M'::text, 'S'::text])`),
    check('CK_Employee_HireDate', sql`(hiredate >= '1996-07-01'::date) AND (hiredate <= (now() + '1 day'::interval))`),
    check('CK_Employee_Gender', sql`upper((gender)::text) = ANY (ARRAY['M'::text, 'F'::text])`),
    check('CK_Employee_VacationHours', sql`(vacationhours >= '-40'::integer) AND (vacationhours <= 240)`),
    check('CK_Employee_SickLeaveHours', sql`(sickleavehours >= 0) AND (sickleavehours <= 120)`),
  ],
);

export const departmentInHumanresources = humanresources.table('department', {
  departmentid: serial().primaryKey().notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  groupname: varchar('groupname', { length: 50 }).notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const billofmaterialsInProduction = production.table(
  'billofmaterials',
  {
    billofmaterialsid: serial().primaryKey().notNull(),
    productassemblyid: integer(),
    componentid: integer().notNull(),
    startdate: timestamp({ mode: 'string' }).defaultNow().notNull(),
    enddate: timestamp({ mode: 'string' }),
    unitmeasurecode: char({ length: 3 }).notNull(),
    bomlevel: smallint().notNull(),
    perassemblyqty: numeric({ precision: 8, scale: 2 }).default('1.00').notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productassemblyid],
      foreignColumns: [productInProduction.productid],
      name: 'FK_BillOfMaterials_Product_ProductAssemblyID',
    }),
    foreignKey({
      columns: [table.componentid],
      foreignColumns: [productInProduction.productid],
      name: 'FK_BillOfMaterials_Product_ComponentID',
    }),
    foreignKey({
      columns: [table.unitmeasurecode],
      foreignColumns: [unitmeasureInProduction.unitmeasurecode],
      name: 'FK_BillOfMaterials_UnitMeasure_UnitMeasureCode',
    }),
    check('CK_BillOfMaterials_EndDate', sql`(enddate > startdate) OR (enddate IS NULL)`),
    check('CK_BillOfMaterials_ProductAssemblyID', sql`productassemblyid <> componentid`),
    check(
      'CK_BillOfMaterials_BOMLevel',
      sql`((productassemblyid IS NULL) AND (bomlevel = 0) AND (perassemblyqty = 1.00)) OR ((productassemblyid IS NOT NULL) AND (bomlevel >= 1))`,
    ),
    check('CK_BillOfMaterials_PerAssemblyQty', sql`perassemblyqty >= 1.00`),
  ],
);

export const jobcandidateInHumanresources = humanresources.table(
  'jobcandidate',
  {
    jobcandidateid: serial().primaryKey().notNull(),
    businessentityid: integer(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [employeeInHumanresources.businessentityid],
      name: 'FK_JobCandidate_Employee_BusinessEntityID',
    }),
  ],
);

export const documentInProduction = production.table(
  'document',
  {
    title: varchar({ length: 50 }).notNull(),
    owner: integer().notNull(),
    folderflag: boolean('folderflag').notNull(),
    filename: varchar({ length: 400 }).notNull(),
    fileextension: varchar({ length: 8 }),
    revision: char({ length: 5 }).notNull(),
    changenumber: integer().default(0).notNull(),
    status: smallint().notNull(),
    documentsummary: text(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
    documentnode: varchar().default('/').primaryKey().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.owner],
      foreignColumns: [employeeInHumanresources.businessentityid],
      name: 'FK_Document_Employee_Owner',
    }),
    unique('document_rowguid_key').on(table.rowguid),
    check('CK_Document_Status', sql`(status >= 1) AND (status <= 3)`),
  ],
);

export const shiftInHumanresources = humanresources.table('shift', {
  shiftid: serial().primaryKey().notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  starttime: time().notNull(),
  endtime: time().notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const productmodelInProduction = production.table('productmodel', {
  productmodelid: serial().primaryKey().notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const productsubcategoryInProduction = production.table(
  'productsubcategory',
  {
    productsubcategoryid: serial().primaryKey().notNull(),
    productcategoryid: integer().notNull(),
    name: varchar('name', { length: 50 }).notNull(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productcategoryid],
      foreignColumns: [productcategoryInProduction.productcategoryid],
      name: 'FK_ProductSubcategory_ProductCategory_ProductCategoryID',
    }),
  ],
);

export const cultureInProduction = production.table('culture', {
  cultureid: char({ length: 6 }).primaryKey().notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const productcategoryInProduction = production.table('productcategory', {
  productcategoryid: serial().primaryKey().notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const locationInProduction = production.table(
  'location',
  {
    locationid: serial().primaryKey().notNull(),
    name: varchar('name', { length: 50 }).notNull(),
    costrate: numeric().default('0.00').notNull(),
    availability: numeric({ precision: 8, scale: 2 }).default('0.00').notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    check('CK_Location_CostRate', sql`costrate >= 0.00`),
    check('CK_Location_Availability', sql`availability >= 0.00`),
  ],
);

export const productInProduction = production.table(
  'product',
  {
    productid: serial().primaryKey().notNull(),
    name: varchar('name', { length: 50 }).notNull(),
    productnumber: varchar({ length: 25 }).notNull(),
    makeflag: boolean('makeflag').notNull(),
    finishedgoodsflag: boolean('finishedgoodsflag').notNull(),
    color: varchar({ length: 15 }),
    safetystocklevel: smallint().notNull(),
    reorderpoint: smallint().notNull(),
    standardcost: numeric().notNull(),
    listprice: numeric().notNull(),
    size: varchar({ length: 5 }),
    sizeunitmeasurecode: char({ length: 3 }),
    weightunitmeasurecode: char({ length: 3 }),
    weight: numeric({ precision: 8, scale: 2 }),
    daystomanufacture: integer().notNull(),
    productline: char({ length: 2 }),
    class: char({ length: 2 }),
    style: char({ length: 2 }),
    productsubcategoryid: integer(),
    productmodelid: integer(),
    sellstartdate: timestamp({ mode: 'string' }).notNull(),
    sellenddate: timestamp({ mode: 'string' }),
    discontinueddate: timestamp({ mode: 'string' }),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sizeunitmeasurecode],
      foreignColumns: [unitmeasureInProduction.unitmeasurecode],
      name: 'FK_Product_UnitMeasure_SizeUnitMeasureCode',
    }),
    foreignKey({
      columns: [table.weightunitmeasurecode],
      foreignColumns: [unitmeasureInProduction.unitmeasurecode],
      name: 'FK_Product_UnitMeasure_WeightUnitMeasureCode',
    }),
    foreignKey({
      columns: [table.productmodelid],
      foreignColumns: [productmodelInProduction.productmodelid],
      name: 'FK_Product_ProductModel_ProductModelID',
    }),
    foreignKey({
      columns: [table.productsubcategoryid],
      foreignColumns: [productsubcategoryInProduction.productsubcategoryid],
      name: 'FK_Product_ProductSubcategory_ProductSubcategoryID',
    }),
    check('CK_Product_SafetyStockLevel', sql`safetystocklevel > 0`),
    check('CK_Product_ReorderPoint', sql`reorderpoint > 0`),
    check('CK_Product_StandardCost', sql`standardcost >= 0.00`),
    check('CK_Product_ListPrice', sql`listprice >= 0.00`),
    check('CK_Product_Weight', sql`weight > 0.00`),
    check('CK_Product_DaysToManufacture', sql`daystomanufacture >= 0`),
    check(
      'CK_Product_ProductLine',
      sql`(upper((productline)::text) = ANY (ARRAY['S'::text, 'T'::text, 'M'::text, 'R'::text])) OR (productline IS NULL)`,
    ),
    check(
      'CK_Product_Class',
      sql`(upper((class)::text) = ANY (ARRAY['L'::text, 'M'::text, 'H'::text])) OR (class IS NULL)`,
    ),
    check(
      'CK_Product_Style',
      sql`(upper((style)::text) = ANY (ARRAY['W'::text, 'M'::text, 'U'::text])) OR (style IS NULL)`,
    ),
    check('CK_Product_SellEndDate', sql`(sellenddate >= sellstartdate) OR (sellenddate IS NULL)`),
  ],
);

export const illustrationInProduction = production.table('illustration', {
  illustrationid: serial().primaryKey().notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const productdescriptionInProduction = production.table('productdescription', {
  productdescriptionid: serial().primaryKey().notNull(),
  description: varchar({ length: 400 }).notNull(),
  rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const productphotoInProduction = production.table('productphoto', {
  productphotoid: serial().primaryKey().notNull(),
  thumbnailphotofilename: varchar({ length: 50 }),
  largephotofilename: varchar({ length: 50 }),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const unitmeasureInProduction = production.table('unitmeasure', {
  unitmeasurecode: char({ length: 3 }).primaryKey().notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const productreviewInProduction = production.table(
  'productreview',
  {
    productreviewid: serial().primaryKey().notNull(),
    productid: integer().notNull(),
    reviewername: varchar('reviewername', { length: 50 }).notNull(),
    reviewdate: timestamp({ mode: 'string' }).defaultNow().notNull(),
    emailaddress: varchar({ length: 50 }).notNull(),
    rating: integer().notNull(),
    comments: varchar({ length: 3850 }),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productid],
      foreignColumns: [productInProduction.productid],
      name: 'FK_ProductReview_Product_ProductID',
    }),
    check('CK_ProductReview_Rating', sql`(rating >= 1) AND (rating <= 5)`),
  ],
);

export const transactionhistoryarchiveInProduction = production.table(
  'transactionhistoryarchive',
  {
    transactionid: integer().primaryKey().notNull(),
    productid: integer().notNull(),
    referenceorderid: integer().notNull(),
    referenceorderlineid: integer().default(0).notNull(),
    transactiondate: timestamp({ mode: 'string' }).defaultNow().notNull(),
    transactiontype: char({ length: 1 }).notNull(),
    quantity: integer().notNull(),
    actualcost: numeric().notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    check(
      'CK_TransactionHistoryArchive_TransactionType',
      sql`upper((transactiontype)::text) = ANY (ARRAY['W'::text, 'S'::text, 'P'::text])`,
    ),
  ],
);

export const purchaseorderheaderInPurchasing = purchasing.table(
  'purchaseorderheader',
  {
    purchaseorderid: serial().primaryKey().notNull(),
    revisionnumber: smallint().default(0).notNull(),
    status: smallint().default(1).notNull(),
    employeeid: integer().notNull(),
    vendorid: integer().notNull(),
    shipmethodid: integer().notNull(),
    orderdate: timestamp({ mode: 'string' }).defaultNow().notNull(),
    shipdate: timestamp({ mode: 'string' }),
    subtotal: numeric().default('0.00').notNull(),
    taxamt: numeric().default('0.00').notNull(),
    freight: numeric().default('0.00').notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.employeeid],
      foreignColumns: [employeeInHumanresources.businessentityid],
      name: 'FK_PurchaseOrderHeader_Employee_EmployeeID',
    }),
    foreignKey({
      columns: [table.vendorid],
      foreignColumns: [vendorInPurchasing.businessentityid],
      name: 'FK_PurchaseOrderHeader_Vendor_VendorID',
    }),
    foreignKey({
      columns: [table.shipmethodid],
      foreignColumns: [shipmethodInPurchasing.shipmethodid],
      name: 'FK_PurchaseOrderHeader_ShipMethod_ShipMethodID',
    }),
    check('CK_PurchaseOrderHeader_Status', sql`(status >= 1) AND (status <= 4)`),
    check('CK_PurchaseOrderHeader_ShipDate', sql`(shipdate >= orderdate) OR (shipdate IS NULL)`),
    check('CK_PurchaseOrderHeader_SubTotal', sql`subtotal >= 0.00`),
    check('CK_PurchaseOrderHeader_TaxAmt', sql`taxamt >= 0.00`),
    check('CK_PurchaseOrderHeader_Freight', sql`freight >= 0.00`),
  ],
);

export const transactionhistoryInProduction = production.table(
  'transactionhistory',
  {
    transactionid: serial().primaryKey().notNull(),
    productid: integer().notNull(),
    referenceorderid: integer().notNull(),
    referenceorderlineid: integer().default(0).notNull(),
    transactiondate: timestamp({ mode: 'string' }).defaultNow().notNull(),
    transactiontype: char({ length: 1 }).notNull(),
    quantity: integer().notNull(),
    actualcost: numeric().notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productid],
      foreignColumns: [productInProduction.productid],
      name: 'FK_TransactionHistory_Product_ProductID',
    }),
    check(
      'CK_TransactionHistory_TransactionType',
      sql`upper((transactiontype)::text) = ANY (ARRAY['W'::text, 'S'::text, 'P'::text])`,
    ),
  ],
);

export const workorderInProduction = production.table(
  'workorder',
  {
    workorderid: serial().primaryKey().notNull(),
    productid: integer().notNull(),
    orderqty: integer().notNull(),
    scrappedqty: smallint().notNull(),
    startdate: timestamp({ mode: 'string' }).notNull(),
    enddate: timestamp({ mode: 'string' }),
    duedate: timestamp({ mode: 'string' }).notNull(),
    scrapreasonid: smallint(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productid],
      foreignColumns: [productInProduction.productid],
      name: 'FK_WorkOrder_Product_ProductID',
    }),
    foreignKey({
      columns: [table.scrapreasonid],
      foreignColumns: [scrapreasonInProduction.scrapreasonid],
      name: 'FK_WorkOrder_ScrapReason_ScrapReasonID',
    }),
    check('CK_WorkOrder_OrderQty', sql`orderqty > 0`),
    check('CK_WorkOrder_ScrappedQty', sql`scrappedqty >= 0`),
    check('CK_WorkOrder_EndDate', sql`(enddate >= startdate) OR (enddate IS NULL)`),
  ],
);

export const scrapreasonInProduction = production.table('scrapreason', {
  scrapreasonid: serial().primaryKey().notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const vendorInPurchasing = purchasing.table(
  'vendor',
  {
    businessentityid: integer().primaryKey().notNull(),
    accountnumber: varchar('accountnumber', { length: 15 }).notNull(),
    name: varchar('name', { length: 50 }).notNull(),
    creditrating: smallint().notNull(),
    preferredvendorstatus: boolean('preferredvendorstatus').notNull(),
    activeflag: boolean('activeflag').notNull(),
    purchasingwebserviceurl: varchar({ length: 1024 }),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [businessentityInPerson.businessentityid],
      name: 'FK_Vendor_BusinessEntity_BusinessEntityID',
    }),
    check('CK_Vendor_CreditRating', sql`(creditrating >= 1) AND (creditrating <= 5)`),
  ],
);

export const currencyInSales = sales.table('currency', {
  currencycode: char({ length: 3 }).primaryKey().notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const currencyrateInSales = sales.table(
  'currencyrate',
  {
    currencyrateid: serial().primaryKey().notNull(),
    currencyratedate: timestamp({ mode: 'string' }).notNull(),
    fromcurrencycode: char({ length: 3 }).notNull(),
    tocurrencycode: char({ length: 3 }).notNull(),
    averagerate: numeric().notNull(),
    endofdayrate: numeric().notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.fromcurrencycode],
      foreignColumns: [currencyInSales.currencycode],
      name: 'FK_CurrencyRate_Currency_FromCurrencyCode',
    }),
    foreignKey({
      columns: [table.tocurrencycode],
      foreignColumns: [currencyInSales.currencycode],
      name: 'FK_CurrencyRate_Currency_ToCurrencyCode',
    }),
  ],
);

export const customerInSales = sales.table(
  'customer',
  {
    customerid: serial().primaryKey().notNull(),
    personid: integer(),
    storeid: integer(),
    territoryid: integer(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.personid],
      foreignColumns: [personInPerson.businessentityid],
      name: 'FK_Customer_Person_PersonID',
    }),
    foreignKey({
      columns: [table.storeid],
      foreignColumns: [storeInSales.businessentityid],
      name: 'FK_Customer_Store_StoreID',
    }),
    foreignKey({
      columns: [table.territoryid],
      foreignColumns: [salesterritoryInSales.territoryid],
      name: 'FK_Customer_SalesTerritory_TerritoryID',
    }),
  ],
);

export const creditcardInSales = sales.table('creditcard', {
  creditcardid: serial().primaryKey().notNull(),
  cardtype: varchar({ length: 50 }).notNull(),
  cardnumber: varchar({ length: 25 }).notNull(),
  expmonth: smallint().notNull(),
  expyear: smallint().notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const shipmethodInPurchasing = purchasing.table(
  'shipmethod',
  {
    shipmethodid: serial().primaryKey().notNull(),
    name: varchar('name', { length: 50 }).notNull(),
    shipbase: numeric().default('0.00').notNull(),
    shiprate: numeric().default('0.00').notNull(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    check('CK_ShipMethod_ShipBase', sql`shipbase > 0.00`),
    check('CK_ShipMethod_ShipRate', sql`shiprate > 0.00`),
  ],
);

export const salesorderheaderInSales = sales.table(
  'salesorderheader',
  {
    salesorderid: serial().primaryKey().notNull(),
    revisionnumber: smallint().default(0).notNull(),
    orderdate: timestamp({ mode: 'string' }).defaultNow().notNull(),
    duedate: timestamp({ mode: 'string' }).notNull(),
    shipdate: timestamp({ mode: 'string' }),
    status: smallint().default(1).notNull(),
    onlineorderflag: boolean('onlineorderflag').notNull(),
    purchaseordernumber: varchar('purchaseordernumber', { length: 25 }),
    accountnumber: varchar('accountnumber', { length: 15 }),
    customerid: integer().notNull(),
    salespersonid: integer(),
    territoryid: integer(),
    billtoaddressid: integer().notNull(),
    shiptoaddressid: integer().notNull(),
    shipmethodid: integer().notNull(),
    creditcardid: integer(),
    creditcardapprovalcode: varchar({ length: 15 }),
    currencyrateid: integer(),
    subtotal: numeric().default('0.00').notNull(),
    taxamt: numeric().default('0.00').notNull(),
    freight: numeric().default('0.00').notNull(),
    totaldue: numeric(),
    comment: varchar({ length: 128 }),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.billtoaddressid],
      foreignColumns: [addressInPerson.addressid],
      name: 'FK_SalesOrderHeader_Address_BillToAddressID',
    }),
    foreignKey({
      columns: [table.shiptoaddressid],
      foreignColumns: [addressInPerson.addressid],
      name: 'FK_SalesOrderHeader_Address_ShipToAddressID',
    }),
    foreignKey({
      columns: [table.creditcardid],
      foreignColumns: [creditcardInSales.creditcardid],
      name: 'FK_SalesOrderHeader_CreditCard_CreditCardID',
    }),
    foreignKey({
      columns: [table.currencyrateid],
      foreignColumns: [currencyrateInSales.currencyrateid],
      name: 'FK_SalesOrderHeader_CurrencyRate_CurrencyRateID',
    }),
    foreignKey({
      columns: [table.customerid],
      foreignColumns: [customerInSales.customerid],
      name: 'FK_SalesOrderHeader_Customer_CustomerID',
    }),
    foreignKey({
      columns: [table.salespersonid],
      foreignColumns: [salespersonInSales.businessentityid],
      name: 'FK_SalesOrderHeader_SalesPerson_SalesPersonID',
    }),
    foreignKey({
      columns: [table.shipmethodid],
      foreignColumns: [shipmethodInPurchasing.shipmethodid],
      name: 'FK_SalesOrderHeader_ShipMethod_ShipMethodID',
    }),
    foreignKey({
      columns: [table.territoryid],
      foreignColumns: [salesterritoryInSales.territoryid],
      name: 'FK_SalesOrderHeader_SalesTerritory_TerritoryID',
    }),
    check('CK_SalesOrderHeader_Status', sql`(status >= 0) AND (status <= 8)`),
    check('CK_SalesOrderHeader_DueDate', sql`duedate >= orderdate`),
    check('CK_SalesOrderHeader_ShipDate', sql`(shipdate >= orderdate) OR (shipdate IS NULL)`),
    check('CK_SalesOrderHeader_SubTotal', sql`subtotal >= 0.00`),
    check('CK_SalesOrderHeader_TaxAmt', sql`taxamt >= 0.00`),
    check('CK_SalesOrderHeader_Freight', sql`freight >= 0.00`),
  ],
);

export const salespersonInSales = sales.table(
  'salesperson',
  {
    businessentityid: integer().primaryKey().notNull(),
    territoryid: integer(),
    salesquota: numeric(),
    bonus: numeric().default('0.00').notNull(),
    commissionpct: numeric().default('0.00').notNull(),
    salesytd: numeric().default('0.00').notNull(),
    saleslastyear: numeric().default('0.00').notNull(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [employeeInHumanresources.businessentityid],
      name: 'FK_SalesPerson_Employee_BusinessEntityID',
    }),
    foreignKey({
      columns: [table.territoryid],
      foreignColumns: [salesterritoryInSales.territoryid],
      name: 'FK_SalesPerson_SalesTerritory_TerritoryID',
    }),
    check('CK_SalesPerson_SalesQuota', sql`salesquota > 0.00`),
    check('CK_SalesPerson_Bonus', sql`bonus >= 0.00`),
    check('CK_SalesPerson_CommissionPct', sql`commissionpct >= 0.00`),
    check('CK_SalesPerson_SalesYTD', sql`salesytd >= 0.00`),
    check('CK_SalesPerson_SalesLastYear', sql`saleslastyear >= 0.00`),
  ],
);

export const salesterritoryInSales = sales.table(
  'salesterritory',
  {
    territoryid: serial().primaryKey().notNull(),
    name: varchar('name', { length: 50 }).notNull(),
    countryregioncode: varchar({ length: 3 }).notNull(),
    group: varchar({ length: 50 }).notNull(),
    salesytd: numeric().default('0.00').notNull(),
    saleslastyear: numeric().default('0.00').notNull(),
    costytd: numeric().default('0.00').notNull(),
    costlastyear: numeric().default('0.00').notNull(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.countryregioncode],
      foreignColumns: [countryregionInPerson.countryregioncode],
      name: 'FK_SalesTerritory_CountryRegion_CountryRegionCode',
    }),
    check('CK_SalesTerritory_SalesYTD', sql`salesytd >= 0.00`),
    check('CK_SalesTerritory_SalesLastYear', sql`saleslastyear >= 0.00`),
    check('CK_SalesTerritory_CostYTD', sql`costytd >= 0.00`),
    check('CK_SalesTerritory_CostLastYear', sql`costlastyear >= 0.00`),
  ],
);

export const storeInSales = sales.table(
  'store',
  {
    businessentityid: integer().primaryKey().notNull(),
    name: varchar('name', { length: 50 }).notNull(),
    salespersonid: integer(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [businessentityInPerson.businessentityid],
      name: 'FK_Store_BusinessEntity_BusinessEntityID',
    }),
    foreignKey({
      columns: [table.salespersonid],
      foreignColumns: [salespersonInSales.businessentityid],
      name: 'FK_Store_SalesPerson_SalesPersonID',
    }),
  ],
);

export const salesreasonInSales = sales.table('salesreason', {
  salesreasonid: serial().primaryKey().notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  reasontype: varchar('reasontype', { length: 50 }).notNull(),
  modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const salestaxrateInSales = sales.table(
  'salestaxrate',
  {
    salestaxrateid: serial().primaryKey().notNull(),
    stateprovinceid: integer().notNull(),
    taxtype: smallint().notNull(),
    taxrate: numeric().default('0.00').notNull(),
    name: varchar('name', { length: 50 }).notNull(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.stateprovinceid],
      foreignColumns: [stateprovinceInPerson.stateprovinceid],
      name: 'FK_SalesTaxRate_StateProvince_StateProvinceID',
    }),
    check('CK_SalesTaxRate_TaxType', sql`(taxtype >= 1) AND (taxtype <= 3)`),
  ],
);

export const shoppingcartitemInSales = sales.table(
  'shoppingcartitem',
  {
    shoppingcartitemid: serial().primaryKey().notNull(),
    shoppingcartid: varchar({ length: 50 }).notNull(),
    quantity: integer().default(1).notNull(),
    productid: integer().notNull(),
    datecreated: timestamp({ mode: 'string' }).defaultNow().notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productid],
      foreignColumns: [productInProduction.productid],
      name: 'FK_ShoppingCartItem_Product_ProductID',
    }),
    check('CK_ShoppingCartItem_Quantity', sql`quantity >= 1`),
  ],
);

export const specialofferInSales = sales.table(
  'specialoffer',
  {
    specialofferid: serial().primaryKey().notNull(),
    description: varchar({ length: 255 }).notNull(),
    discountpct: numeric().default('0.00').notNull(),
    type: varchar({ length: 50 }).notNull(),
    category: varchar({ length: 50 }).notNull(),
    startdate: timestamp({ mode: 'string' }).notNull(),
    enddate: timestamp({ mode: 'string' }).notNull(),
    minqty: integer().default(0).notNull(),
    maxqty: integer(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    check('CK_SpecialOffer_EndDate', sql`enddate >= startdate`),
    check('CK_SpecialOffer_DiscountPct', sql`discountpct >= 0.00`),
    check('CK_SpecialOffer_MinQty', sql`minqty >= 0`),
    check('CK_SpecialOffer_MaxQty', sql`maxqty >= 0`),
  ],
);

export const productdocumentInProduction = production.table(
  'productdocument',
  {
    productid: integer().notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
    documentnode: varchar().default('/').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productid],
      foreignColumns: [productInProduction.productid],
      name: 'FK_ProductDocument_Product_ProductID',
    }),
    foreignKey({
      columns: [table.documentnode],
      foreignColumns: [documentInProduction.documentnode],
      name: 'FK_ProductDocument_Document_DocumentNode',
    }),
    primaryKey({ columns: [table.documentnode, table.productid], name: 'PK_ProductDocument_ProductID_DocumentNode' }),
  ],
);

export const productmodelillustrationInProduction = production.table(
  'productmodelillustration',
  {
    productmodelid: integer().notNull(),
    illustrationid: integer().notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productmodelid],
      foreignColumns: [productmodelInProduction.productmodelid],
      name: 'FK_ProductModelIllustration_ProductModel_ProductModelID',
    }),
    foreignKey({
      columns: [table.illustrationid],
      foreignColumns: [illustrationInProduction.illustrationid],
      name: 'FK_ProductModelIllustration_Illustration_IllustrationID',
    }),
    primaryKey({
      columns: [table.illustrationid, table.productmodelid],
      name: 'PK_ProductModelIllustration_ProductModelID_IllustrationID',
    }),
  ],
);

export const countryregioncurrencyInSales = sales.table(
  'countryregioncurrency',
  {
    countryregioncode: varchar({ length: 3 }).notNull(),
    currencycode: char({ length: 3 }).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.countryregioncode],
      foreignColumns: [countryregionInPerson.countryregioncode],
      name: 'FK_CountryRegionCurrency_CountryRegion_CountryRegionCode',
    }),
    foreignKey({
      columns: [table.currencycode],
      foreignColumns: [currencyInSales.currencycode],
      name: 'FK_CountryRegionCurrency_Currency_CurrencyCode',
    }),
    primaryKey({
      columns: [table.countryregioncode, table.currencycode],
      name: 'PK_CountryRegionCurrency_CountryRegionCode_CurrencyCode',
    }),
  ],
);

export const personcreditcardInSales = sales.table(
  'personcreditcard',
  {
    businessentityid: integer().notNull(),
    creditcardid: integer().notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [personInPerson.businessentityid],
      name: 'FK_PersonCreditCard_Person_BusinessEntityID',
    }),
    foreignKey({
      columns: [table.creditcardid],
      foreignColumns: [creditcardInSales.creditcardid],
      name: 'FK_PersonCreditCard_CreditCard_CreditCardID',
    }),
    primaryKey({
      columns: [table.businessentityid, table.creditcardid],
      name: 'PK_PersonCreditCard_BusinessEntityID_CreditCardID',
    }),
  ],
);

export const salesorderheadersalesreasonInSales = sales.table(
  'salesorderheadersalesreason',
  {
    salesorderid: integer().notNull(),
    salesreasonid: integer().notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.salesreasonid],
      foreignColumns: [salesreasonInSales.salesreasonid],
      name: 'FK_SalesOrderHeaderSalesReason_SalesReason_SalesReasonID',
    }),
    foreignKey({
      columns: [table.salesorderid],
      foreignColumns: [salesorderheaderInSales.salesorderid],
      name: 'FK_SalesOrderHeaderSalesReason_SalesOrderHeader_SalesOrderID',
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.salesorderid, table.salesreasonid],
      name: 'PK_SalesOrderHeaderSalesReason_SalesOrderID_SalesReasonID',
    }),
  ],
);

export const personphoneInPerson = person.table(
  'personphone',
  {
    businessentityid: integer().notNull(),
    phonenumber: varchar('phonenumber', { length: 25 }).notNull(),
    phonenumbertypeid: integer().notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [personInPerson.businessentityid],
      name: 'FK_PersonPhone_Person_BusinessEntityID',
    }),
    foreignKey({
      columns: [table.phonenumbertypeid],
      foreignColumns: [phonenumbertypeInPerson.phonenumbertypeid],
      name: 'FK_PersonPhone_PhoneNumberType_PhoneNumberTypeID',
    }),
    primaryKey({
      columns: [table.businessentityid, table.phonenumber, table.phonenumbertypeid],
      name: 'PK_PersonPhone_BusinessEntityID_PhoneNumber_PhoneNumberTypeID',
    }),
  ],
);

export const productmodelproductdescriptioncultureInProduction = production.table(
  'productmodelproductdescriptionculture',
  {
    productmodelid: integer().notNull(),
    productdescriptionid: integer().notNull(),
    cultureid: char({ length: 6 }).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productdescriptionid],
      foreignColumns: [productdescriptionInProduction.productdescriptionid],
      name: 'FK_ProductModelProductDescriptionCulture_ProductDescription_Pro',
    }),
    foreignKey({
      columns: [table.cultureid],
      foreignColumns: [cultureInProduction.cultureid],
      name: 'FK_ProductModelProductDescriptionCulture_Culture_CultureID',
    }),
    foreignKey({
      columns: [table.productmodelid],
      foreignColumns: [productmodelInProduction.productmodelid],
      name: 'FK_ProductModelProductDescriptionCulture_ProductModel_ProductMo',
    }),
    primaryKey({
      columns: [table.cultureid, table.productdescriptionid, table.productmodelid],
      name: 'PK_ProductModelProductDescriptionCulture_ProductModelID_Product',
    }),
  ],
);

export const productproductphotoInProduction = production.table(
  'productproductphoto',
  {
    productid: integer().notNull(),
    productphotoid: integer().notNull(),
    primary: boolean('primary').notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productid],
      foreignColumns: [productInProduction.productid],
      name: 'FK_ProductProductPhoto_Product_ProductID',
    }),
    foreignKey({
      columns: [table.productphotoid],
      foreignColumns: [productphotoInProduction.productphotoid],
      name: 'FK_ProductProductPhoto_ProductPhoto_ProductPhotoID',
    }),
    primaryKey({
      columns: [table.productid, table.productphotoid],
      name: 'PK_ProductProductPhoto_ProductID_ProductPhotoID',
    }),
  ],
);

export const specialofferproductInSales = sales.table(
  'specialofferproduct',
  {
    specialofferid: integer().notNull(),
    productid: integer().notNull(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productid],
      foreignColumns: [productInProduction.productid],
      name: 'FK_SpecialOfferProduct_Product_ProductID',
    }),
    foreignKey({
      columns: [table.specialofferid],
      foreignColumns: [specialofferInSales.specialofferid],
      name: 'FK_SpecialOfferProduct_SpecialOffer_SpecialOfferID',
    }),
    primaryKey({
      columns: [table.productid, table.specialofferid],
      name: 'PK_SpecialOfferProduct_SpecialOfferID_ProductID',
    }),
  ],
);

export const businessentityaddressInPerson = person.table(
  'businessentityaddress',
  {
    businessentityid: integer().notNull(),
    addressid: integer().notNull(),
    addresstypeid: integer().notNull(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.addressid],
      foreignColumns: [addressInPerson.addressid],
      name: 'FK_BusinessEntityAddress_Address_AddressID',
    }),
    foreignKey({
      columns: [table.addresstypeid],
      foreignColumns: [addresstypeInPerson.addresstypeid],
      name: 'FK_BusinessEntityAddress_AddressType_AddressTypeID',
    }),
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [businessentityInPerson.businessentityid],
      name: 'FK_BusinessEntityAddress_BusinessEntity_BusinessEntityID',
    }),
    primaryKey({
      columns: [table.addressid, table.addresstypeid, table.businessentityid],
      name: 'PK_BusinessEntityAddress_BusinessEntityID_AddressID_AddressType',
    }),
  ],
);

export const businessentitycontactInPerson = person.table(
  'businessentitycontact',
  {
    businessentityid: integer().notNull(),
    personid: integer().notNull(),
    contacttypeid: integer().notNull(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.personid],
      foreignColumns: [personInPerson.businessentityid],
      name: 'FK_BusinessEntityContact_Person_PersonID',
    }),
    foreignKey({
      columns: [table.contacttypeid],
      foreignColumns: [contacttypeInPerson.contacttypeid],
      name: 'FK_BusinessEntityContact_ContactType_ContactTypeID',
    }),
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [businessentityInPerson.businessentityid],
      name: 'FK_BusinessEntityContact_BusinessEntity_BusinessEntityID',
    }),
    primaryKey({
      columns: [table.businessentityid, table.contacttypeid, table.personid],
      name: 'PK_BusinessEntityContact_BusinessEntityID_PersonID_ContactTypeI',
    }),
  ],
);

export const emailaddressInPerson = person.table(
  'emailaddress',
  {
    businessentityid: integer().notNull(),
    emailaddressid: serial().notNull(),
    emailaddress: varchar({ length: 50 }),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [personInPerson.businessentityid],
      name: 'FK_EmailAddress_Person_BusinessEntityID',
    }),
    primaryKey({
      columns: [table.businessentityid, table.emailaddressid],
      name: 'PK_EmailAddress_BusinessEntityID_EmailAddressID',
    }),
  ],
);

export const employeepayhistoryInHumanresources = humanresources.table(
  'employeepayhistory',
  {
    businessentityid: integer().notNull(),
    ratechangedate: timestamp({ mode: 'string' }).notNull(),
    rate: numeric().notNull(),
    payfrequency: smallint().notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [employeeInHumanresources.businessentityid],
      name: 'FK_EmployeePayHistory_Employee_BusinessEntityID',
    }),
    primaryKey({
      columns: [table.businessentityid, table.ratechangedate],
      name: 'PK_EmployeePayHistory_BusinessEntityID_RateChangeDate',
    }),
    check('CK_EmployeePayHistory_PayFrequency', sql`payfrequency = ANY (ARRAY[1, 2])`),
    check('CK_EmployeePayHistory_Rate', sql`(rate >= 6.50) AND (rate <= 200.00)`),
  ],
);

export const productcosthistoryInProduction = production.table(
  'productcosthistory',
  {
    productid: integer().notNull(),
    startdate: timestamp({ mode: 'string' }).notNull(),
    enddate: timestamp({ mode: 'string' }),
    standardcost: numeric().notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productid],
      foreignColumns: [productInProduction.productid],
      name: 'FK_ProductCostHistory_Product_ProductID',
    }),
    primaryKey({ columns: [table.productid, table.startdate], name: 'PK_ProductCostHistory_ProductID_StartDate' }),
    check('CK_ProductCostHistory_EndDate', sql`(enddate >= startdate) OR (enddate IS NULL)`),
    check('CK_ProductCostHistory_StandardCost', sql`standardcost >= 0.00`),
  ],
);

export const productlistpricehistoryInProduction = production.table(
  'productlistpricehistory',
  {
    productid: integer().notNull(),
    startdate: timestamp({ mode: 'string' }).notNull(),
    enddate: timestamp({ mode: 'string' }),
    listprice: numeric().notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productid],
      foreignColumns: [productInProduction.productid],
      name: 'FK_ProductListPriceHistory_Product_ProductID',
    }),
    primaryKey({ columns: [table.productid, table.startdate], name: 'PK_ProductListPriceHistory_ProductID_StartDate' }),
    check('CK_ProductListPriceHistory_EndDate', sql`(enddate >= startdate) OR (enddate IS NULL)`),
    check('CK_ProductListPriceHistory_ListPrice', sql`listprice > 0.00`),
  ],
);

export const salespersonquotahistoryInSales = sales.table(
  'salespersonquotahistory',
  {
    businessentityid: integer().notNull(),
    quotadate: timestamp({ mode: 'string' }).notNull(),
    salesquota: numeric().notNull(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [salespersonInSales.businessentityid],
      name: 'FK_SalesPersonQuotaHistory_SalesPerson_BusinessEntityID',
    }),
    primaryKey({
      columns: [table.businessentityid, table.quotadate],
      name: 'PK_SalesPersonQuotaHistory_BusinessEntityID_QuotaDate',
    }),
    check('CK_SalesPersonQuotaHistory_SalesQuota', sql`salesquota > 0.00`),
  ],
);

export const employeedepartmenthistoryInHumanresources = humanresources.table(
  'employeedepartmenthistory',
  {
    businessentityid: integer().notNull(),
    departmentid: smallint().notNull(),
    shiftid: smallint().notNull(),
    startdate: date().notNull(),
    enddate: date(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.departmentid],
      foreignColumns: [departmentInHumanresources.departmentid],
      name: 'FK_EmployeeDepartmentHistory_Department_DepartmentID',
    }),
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [employeeInHumanresources.businessentityid],
      name: 'FK_EmployeeDepartmentHistory_Employee_BusinessEntityID',
    }),
    foreignKey({
      columns: [table.shiftid],
      foreignColumns: [shiftInHumanresources.shiftid],
      name: 'FK_EmployeeDepartmentHistory_Shift_ShiftID',
    }),
    primaryKey({
      columns: [table.businessentityid, table.departmentid, table.shiftid, table.startdate],
      name: 'PK_EmployeeDepartmentHistory_BusinessEntityID_StartDate_Departm',
    }),
    check('CK_EmployeeDepartmentHistory_EndDate', sql`(enddate >= startdate) OR (enddate IS NULL)`),
  ],
);

export const salesterritoryhistoryInSales = sales.table(
  'salesterritoryhistory',
  {
    businessentityid: integer().notNull(),
    territoryid: integer().notNull(),
    startdate: timestamp({ mode: 'string' }).notNull(),
    enddate: timestamp({ mode: 'string' }),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [salespersonInSales.businessentityid],
      name: 'FK_SalesTerritoryHistory_SalesPerson_BusinessEntityID',
    }),
    foreignKey({
      columns: [table.territoryid],
      foreignColumns: [salesterritoryInSales.territoryid],
      name: 'FK_SalesTerritoryHistory_SalesTerritory_TerritoryID',
    }),
    primaryKey({
      columns: [table.businessentityid, table.startdate, table.territoryid],
      name: 'PK_SalesTerritoryHistory_BusinessEntityID_StartDate_TerritoryID',
    }),
    check('CK_SalesTerritoryHistory_EndDate', sql`(enddate >= startdate) OR (enddate IS NULL)`),
  ],
);

export const productinventoryInProduction = production.table(
  'productinventory',
  {
    productid: integer().notNull(),
    locationid: smallint().notNull(),
    shelf: varchar({ length: 10 }).notNull(),
    bin: smallint().notNull(),
    quantity: smallint().default(0).notNull(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.locationid],
      foreignColumns: [locationInProduction.locationid],
      name: 'FK_ProductInventory_Location_LocationID',
    }),
    foreignKey({
      columns: [table.productid],
      foreignColumns: [productInProduction.productid],
      name: 'FK_ProductInventory_Product_ProductID',
    }),
    primaryKey({ columns: [table.locationid, table.productid], name: 'PK_ProductInventory_ProductID_LocationID' }),
    check('CK_ProductInventory_Bin', sql`(bin >= 0) AND (bin <= 100)`),
  ],
);

export const purchaseorderdetailInPurchasing = purchasing.table(
  'purchaseorderdetail',
  {
    purchaseorderid: integer().notNull(),
    purchaseorderdetailid: serial().notNull(),
    duedate: timestamp({ mode: 'string' }).notNull(),
    orderqty: smallint().notNull(),
    productid: integer().notNull(),
    unitprice: numeric().notNull(),
    receivedqty: numeric({ precision: 8, scale: 2 }).notNull(),
    rejectedqty: numeric({ precision: 8, scale: 2 }).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productid],
      foreignColumns: [productInProduction.productid],
      name: 'FK_PurchaseOrderDetail_Product_ProductID',
    }),
    foreignKey({
      columns: [table.purchaseorderid],
      foreignColumns: [purchaseorderheaderInPurchasing.purchaseorderid],
      name: 'FK_PurchaseOrderDetail_PurchaseOrderHeader_PurchaseOrderID',
    }),
    primaryKey({
      columns: [table.purchaseorderdetailid, table.purchaseorderid],
      name: 'PK_PurchaseOrderDetail_PurchaseOrderID_PurchaseOrderDetailID',
    }),
    check('CK_PurchaseOrderDetail_OrderQty', sql`orderqty > 0`),
    check('CK_PurchaseOrderDetail_UnitPrice', sql`unitprice >= 0.00`),
    check('CK_PurchaseOrderDetail_ReceivedQty', sql`receivedqty >= 0.00`),
    check('CK_PurchaseOrderDetail_RejectedQty', sql`rejectedqty >= 0.00`),
  ],
);

export const salesorderdetailInSales = sales.table(
  'salesorderdetail',
  {
    salesorderid: integer().notNull(),
    salesorderdetailid: serial().notNull(),
    carriertrackingnumber: varchar({ length: 25 }),
    orderqty: smallint().notNull(),
    productid: integer().notNull(),
    specialofferid: integer().notNull(),
    unitprice: numeric().notNull(),
    unitpricediscount: numeric().default('0.0').notNull(),
    rowguid: uuid().default(sql`uuid_generate_v1()`).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.salesorderid],
      foreignColumns: [salesorderheaderInSales.salesorderid],
      name: 'FK_SalesOrderDetail_SalesOrderHeader_SalesOrderID',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.specialofferid, table.productid],
      foreignColumns: [specialofferproductInSales.specialofferid, specialofferproductInSales.productid],
      name: 'FK_SalesOrderDetail_SpecialOfferProduct_SpecialOfferIDProductID',
    }),
    primaryKey({
      columns: [table.salesorderdetailid, table.salesorderid],
      name: 'PK_SalesOrderDetail_SalesOrderID_SalesOrderDetailID',
    }),
    check('CK_SalesOrderDetail_OrderQty', sql`orderqty > 0`),
    check('CK_SalesOrderDetail_UnitPrice', sql`unitprice >= 0.00`),
    check('CK_SalesOrderDetail_UnitPriceDiscount', sql`unitpricediscount >= 0.00`),
  ],
);

export const productvendorInPurchasing = purchasing.table(
  'productvendor',
  {
    productid: integer().notNull(),
    businessentityid: integer().notNull(),
    averageleadtime: integer().notNull(),
    standardprice: numeric().notNull(),
    lastreceiptcost: numeric(),
    lastreceiptdate: timestamp({ mode: 'string' }),
    minorderqty: integer().notNull(),
    maxorderqty: integer().notNull(),
    onorderqty: integer(),
    unitmeasurecode: char({ length: 3 }).notNull(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.productid],
      foreignColumns: [productInProduction.productid],
      name: 'FK_ProductVendor_Product_ProductID',
    }),
    foreignKey({
      columns: [table.unitmeasurecode],
      foreignColumns: [unitmeasureInProduction.unitmeasurecode],
      name: 'FK_ProductVendor_UnitMeasure_UnitMeasureCode',
    }),
    foreignKey({
      columns: [table.businessentityid],
      foreignColumns: [vendorInPurchasing.businessentityid],
      name: 'FK_ProductVendor_Vendor_BusinessEntityID',
    }),
    primaryKey({
      columns: [table.businessentityid, table.productid],
      name: 'PK_ProductVendor_ProductID_BusinessEntityID',
    }),
    check('CK_ProductVendor_AverageLeadTime', sql`averageleadtime >= 1`),
    check('CK_ProductVendor_StandardPrice', sql`standardprice > 0.00`),
    check('CK_ProductVendor_LastReceiptCost', sql`lastreceiptcost > 0.00`),
    check('CK_ProductVendor_MinOrderQty', sql`minorderqty >= 1`),
    check('CK_ProductVendor_MaxOrderQty', sql`maxorderqty >= 1`),
    check('CK_ProductVendor_OnOrderQty', sql`onorderqty >= 0`),
  ],
);

export const workorderroutingInProduction = production.table(
  'workorderrouting',
  {
    workorderid: integer().notNull(),
    productid: integer().notNull(),
    operationsequence: smallint().notNull(),
    locationid: smallint().notNull(),
    scheduledstartdate: timestamp({ mode: 'string' }).notNull(),
    scheduledenddate: timestamp({ mode: 'string' }).notNull(),
    actualstartdate: timestamp({ mode: 'string' }),
    actualenddate: timestamp({ mode: 'string' }),
    actualresourcehrs: numeric({ precision: 9, scale: 4 }),
    plannedcost: numeric().notNull(),
    actualcost: numeric(),
    modifieddate: timestamp({ mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.locationid],
      foreignColumns: [locationInProduction.locationid],
      name: 'FK_WorkOrderRouting_Location_LocationID',
    }),
    foreignKey({
      columns: [table.workorderid],
      foreignColumns: [workorderInProduction.workorderid],
      name: 'FK_WorkOrderRouting_WorkOrder_WorkOrderID',
    }),
    primaryKey({
      columns: [table.operationsequence, table.productid, table.workorderid],
      name: 'PK_WorkOrderRouting_WorkOrderID_ProductID_OperationSequence',
    }),
    check('CK_WorkOrderRouting_ScheduledEndDate', sql`scheduledenddate >= scheduledstartdate`),
    check(
      'CK_WorkOrderRouting_ActualEndDate',
      sql`(actualenddate >= actualstartdate) OR (actualenddate IS NULL) OR (actualstartdate IS NULL)`,
    ),
    check('CK_WorkOrderRouting_ActualResourceHrs', sql`actualresourcehrs >= 0.0000`),
    check('CK_WorkOrderRouting_PlannedCost', sql`plannedcost > 0.00`),
    check('CK_WorkOrderRouting_ActualCost', sql`actualcost > 0.00`),
  ],
);
export const vadditionalcontactinfoInPerson = person
  .view('vadditionalcontactinfo', {
    businessentityid: integer(),
    firstname: varchar('firstname', { length: 50 }),
    middlename: varchar('middlename', { length: 50 }),
    lastname: varchar('lastname', { length: 50 }),
    telephonespecialinstructions: text(),
    emailspecialinstructions: text(),
    rowguid: uuid(),
    modifieddate: timestamp({ mode: 'string' }),
  })
  .as(
    sql`SELECT p.businessentityid, p.firstname, p.middlename, p.lastname, (xpath('(act:telephoneNumber)[1]/act:number/text()'::text, additional.node, '{{act,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ContactTypes}}'::text[]))[1] AS telephonenumber, btrim((xpath('(act:telephoneNumber)[1]/act:SpecialInstructions/text()'::text, additional.node, '{{act,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ContactTypes}}'::text[]))[1]::character varying::text) AS telephonespecialinstructions, (xpath('(act:homePostalAddress)[1]/act:Street/text()'::text, additional.node, '{{act,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ContactTypes}}'::text[]))[1] AS street, (xpath('(act:homePostalAddress)[1]/act:City/text()'::text, additional.node, '{{act,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ContactTypes}}'::text[]))[1] AS city, (xpath('(act:homePostalAddress)[1]/act:StateProvince/text()'::text, additional.node, '{{act,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ContactTypes}}'::text[]))[1] AS stateprovince, (xpath('(act:homePostalAddress)[1]/act:PostalCode/text()'::text, additional.node, '{{act,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ContactTypes}}'::text[]))[1] AS postalcode, (xpath('(act:homePostalAddress)[1]/act:CountryRegion/text()'::text, additional.node, '{{act,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ContactTypes}}'::text[]))[1] AS countryregion, (xpath('(act:homePostalAddress)[1]/act:SpecialInstructions/text()'::text, additional.node, '{{act,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ContactTypes}}'::text[]))[1] AS homeaddressspecialinstructions, (xpath('(act:eMail)[1]/act:eMailAddress/text()'::text, additional.node, '{{act,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ContactTypes}}'::text[]))[1] AS emailaddress, btrim((xpath('(act:eMail)[1]/act:SpecialInstructions/text()'::text, additional.node, '{{act,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ContactTypes}}'::text[]))[1]::character varying::text) AS emailspecialinstructions, (xpath('((act:eMail)[1]/act:SpecialInstructions/act:telephoneNumber)[1]/act:number/text()'::text, additional.node, '{{act,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ContactTypes}}'::text[]))[1] AS emailtelephonenumber, p.rowguid, p.modifieddate FROM person.person p LEFT JOIN ( SELECT person.businessentityid, unnest(xpath('/ci:AdditionalContactInfo'::text, person.additionalcontactinfo, '{{ci,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ContactInfo}}'::text[])) AS node FROM person.person WHERE person.additionalcontactinfo IS NOT NULL) additional ON p.businessentityid = additional.businessentityid`,
  );

export const vemployeeInHumanresources = humanresources
  .view('vemployee', {
    businessentityid: integer(),
    title: varchar({ length: 8 }),
    firstname: varchar('firstname', { length: 50 }),
    middlename: varchar('middlename', { length: 50 }),
    lastname: varchar('lastname', { length: 50 }),
    suffix: varchar({ length: 10 }),
    jobtitle: varchar({ length: 50 }),
    phonenumber: varchar('phonenumber', { length: 25 }),
    phonenumbertype: varchar('phonenumbertype', { length: 50 }),
    emailaddress: varchar({ length: 50 }),
    emailpromotion: integer(),
    addressline1: varchar({ length: 60 }),
    addressline2: varchar({ length: 60 }),
    city: varchar({ length: 30 }),
    stateprovincename: varchar('stateprovincename', { length: 50 }),
    postalcode: varchar({ length: 15 }),
    countryregionname: varchar('countryregionname', { length: 50 }),
  })
  .as(
    sql`SELECT e.businessentityid, p.title, p.firstname, p.middlename, p.lastname, p.suffix, e.jobtitle, pp.phonenumber, pnt.name AS phonenumbertype, ea.emailaddress, p.emailpromotion, a.addressline1, a.addressline2, a.city, sp.name AS stateprovincename, a.postalcode, cr.name AS countryregionname, p.additionalcontactinfo FROM humanresources.employee e JOIN person.person p ON p.businessentityid = e.businessentityid JOIN person.businessentityaddress bea ON bea.businessentityid = e.businessentityid JOIN person.address a ON a.addressid = bea.addressid JOIN person.stateprovince sp ON sp.stateprovinceid = a.stateprovinceid JOIN person.countryregion cr ON cr.countryregioncode::text = sp.countryregioncode::text LEFT JOIN person.personphone pp ON pp.businessentityid = p.businessentityid LEFT JOIN person.phonenumbertype pnt ON pp.phonenumbertypeid = pnt.phonenumbertypeid LEFT JOIN person.emailaddress ea ON p.businessentityid = ea.businessentityid`,
  );

export const vemployeedepartmentInHumanresources = humanresources
  .view('vemployeedepartment', {
    businessentityid: integer(),
    title: varchar({ length: 8 }),
    firstname: varchar('firstname', { length: 50 }),
    middlename: varchar('middlename', { length: 50 }),
    lastname: varchar('lastname', { length: 50 }),
    suffix: varchar({ length: 10 }),
    jobtitle: varchar({ length: 50 }),
    department: varchar('department', { length: 50 }),
    groupname: varchar('groupname', { length: 50 }),
    startdate: date(),
  })
  .as(
    sql`SELECT e.businessentityid, p.title, p.firstname, p.middlename, p.lastname, p.suffix, e.jobtitle, d.name AS department, d.groupname, edh.startdate FROM humanresources.employee e JOIN person.person p ON p.businessentityid = e.businessentityid JOIN humanresources.employeedepartmenthistory edh ON e.businessentityid = edh.businessentityid JOIN humanresources.department d ON edh.departmentid = d.departmentid WHERE edh.enddate IS NULL`,
  );

export const vemployeedepartmenthistoryInHumanresources = humanresources
  .view('vemployeedepartmenthistory', {
    businessentityid: integer(),
    title: varchar({ length: 8 }),
    firstname: varchar('firstname', { length: 50 }),
    middlename: varchar('middlename', { length: 50 }),
    lastname: varchar('lastname', { length: 50 }),
    suffix: varchar({ length: 10 }),
    shift: varchar('shift', { length: 50 }),
    department: varchar('department', { length: 50 }),
    groupname: varchar('groupname', { length: 50 }),
    startdate: date(),
    enddate: date(),
  })
  .as(
    sql`SELECT e.businessentityid, p.title, p.firstname, p.middlename, p.lastname, p.suffix, s.name AS shift, d.name AS department, d.groupname, edh.startdate, edh.enddate FROM humanresources.employee e JOIN person.person p ON p.businessentityid = e.businessentityid JOIN humanresources.employeedepartmenthistory edh ON e.businessentityid = edh.businessentityid JOIN humanresources.department d ON edh.departmentid = d.departmentid JOIN humanresources.shift s ON s.shiftid = edh.shiftid`,
  );

export const vindividualcustomerInSales = sales
  .view('vindividualcustomer', {
    businessentityid: integer(),
    title: varchar({ length: 8 }),
    firstname: varchar('firstname', { length: 50 }),
    middlename: varchar('middlename', { length: 50 }),
    lastname: varchar('lastname', { length: 50 }),
    suffix: varchar({ length: 10 }),
    phonenumber: varchar('phonenumber', { length: 25 }),
    phonenumbertype: varchar('phonenumbertype', { length: 50 }),
    emailaddress: varchar({ length: 50 }),
    emailpromotion: integer(),
    addresstype: varchar('addresstype', { length: 50 }),
    addressline1: varchar({ length: 60 }),
    addressline2: varchar({ length: 60 }),
    city: varchar({ length: 30 }),
    stateprovincename: varchar('stateprovincename', { length: 50 }),
    postalcode: varchar({ length: 15 }),
    countryregionname: varchar('countryregionname', { length: 50 }),
  })
  .as(
    sql`SELECT p.businessentityid, p.title, p.firstname, p.middlename, p.lastname, p.suffix, pp.phonenumber, pnt.name AS phonenumbertype, ea.emailaddress, p.emailpromotion, at.name AS addresstype, a.addressline1, a.addressline2, a.city, sp.name AS stateprovincename, a.postalcode, cr.name AS countryregionname, p.demographics FROM person.person p JOIN person.businessentityaddress bea ON bea.businessentityid = p.businessentityid JOIN person.address a ON a.addressid = bea.addressid JOIN person.stateprovince sp ON sp.stateprovinceid = a.stateprovinceid JOIN person.countryregion cr ON cr.countryregioncode::text = sp.countryregioncode::text JOIN person.addresstype at ON at.addresstypeid = bea.addresstypeid JOIN sales.customer c ON c.personid = p.businessentityid LEFT JOIN person.emailaddress ea ON ea.businessentityid = p.businessentityid LEFT JOIN person.personphone pp ON pp.businessentityid = p.businessentityid LEFT JOIN person.phonenumbertype pnt ON pnt.phonenumbertypeid = pp.phonenumbertypeid WHERE c.storeid IS NULL`,
  );

export const vpersondemographicsInSales = sales
  .view('vpersondemographics', {
    businessentityid: integer(),
    totalpurchaseytd: numeric('totalpurchaseytd', { precision: 19, scale: 4 }),
    datefirstpurchase: date(),
    birthdate: date(),
    maritalstatus: varchar({ length: 1 }),
    yearlyincome: varchar({ length: 30 }),
    gender: varchar({ length: 1 }),
    totalchildren: integer(),
    numberchildrenathome: integer(),
    education: varchar({ length: 30 }),
    occupation: varchar({ length: 30 }),
    homeownerflag: boolean(),
    numbercarsowned: integer(),
  })
  .as(
    sql`SELECT businessentityid, (xpath('n:TotalPurchaseYTD/text()'::text, demographics, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/IndividualSurvey}}'::text[]))[1]::character varying::money AS totalpurchaseytd, (xpath('n:DateFirstPurchase/text()'::text, demographics, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/IndividualSurvey}}'::text[]))[1]::character varying::date AS datefirstpurchase, (xpath('n:BirthDate/text()'::text, demographics, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/IndividualSurvey}}'::text[]))[1]::character varying::date AS birthdate, (xpath('n:MaritalStatus/text()'::text, demographics, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/IndividualSurvey}}'::text[]))[1]::character varying(1) AS maritalstatus, (xpath('n:YearlyIncome/text()'::text, demographics, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/IndividualSurvey}}'::text[]))[1]::character varying(30) AS yearlyincome, (xpath('n:Gender/text()'::text, demographics, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/IndividualSurvey}}'::text[]))[1]::character varying(1) AS gender, (xpath('n:TotalChildren/text()'::text, demographics, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/IndividualSurvey}}'::text[]))[1]::character varying::integer AS totalchildren, (xpath('n:NumberChildrenAtHome/text()'::text, demographics, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/IndividualSurvey}}'::text[]))[1]::character varying::integer AS numberchildrenathome, (xpath('n:Education/text()'::text, demographics, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/IndividualSurvey}}'::text[]))[1]::character varying(30) AS education, (xpath('n:Occupation/text()'::text, demographics, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/IndividualSurvey}}'::text[]))[1]::character varying(30) AS occupation, (xpath('n:HomeOwnerFlag/text()'::text, demographics, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/IndividualSurvey}}'::text[]))[1]::character varying::boolean AS homeownerflag, (xpath('n:NumberCarsOwned/text()'::text, demographics, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/IndividualSurvey}}'::text[]))[1]::character varying::integer AS numbercarsowned FROM person.person WHERE demographics IS NOT NULL`,
  );

export const vjobcandidateInHumanresources = humanresources
  .view('vjobcandidate', {
    jobcandidateid: integer(),
    businessentityid: integer(),
    namePrefix: varchar('Name.Prefix', { length: 30 }),
    nameFirst: varchar('Name.First', { length: 30 }),
    nameMiddle: varchar('Name.Middle', { length: 30 }),
    nameLast: varchar('Name.Last', { length: 30 }),
    nameSuffix: varchar('Name.Suffix', { length: 30 }),
    skills: varchar('Skills'),
    addrType: varchar('Addr.Type', { length: 30 }),
    addrLocCountryRegion: varchar('Addr.Loc.CountryRegion', { length: 100 }),
    addrLocState: varchar('Addr.Loc.State', { length: 100 }),
    addrLocCity: varchar('Addr.Loc.City', { length: 100 }),
    addrPostalCode: varchar('Addr.PostalCode', { length: 20 }),
    email: varchar('EMail'),
    webSite: varchar('WebSite'),
    modifieddate: timestamp({ mode: 'string' }),
  })
  .as(
    sql`SELECT jobcandidateid, businessentityid, (xpath('/n:Resume/n:Name/n:Name.Prefix/text()'::text, resume, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))[1]::character varying(30) AS "Name.Prefix", (xpath('/n:Resume/n:Name/n:Name.First/text()'::text, resume, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))[1]::character varying(30) AS "Name.First", (xpath('/n:Resume/n:Name/n:Name.Middle/text()'::text, resume, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))[1]::character varying(30) AS "Name.Middle", (xpath('/n:Resume/n:Name/n:Name.Last/text()'::text, resume, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))[1]::character varying(30) AS "Name.Last", (xpath('/n:Resume/n:Name/n:Name.Suffix/text()'::text, resume, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))[1]::character varying(30) AS "Name.Suffix", (xpath('/n:Resume/n:Skills/text()'::text, resume, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))[1]::character varying AS "Skills", (xpath('n:Address/n:Addr.Type/text()'::text, resume, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))[1]::character varying(30) AS "Addr.Type", (xpath('n:Address/n:Addr.Location/n:Location/n:Loc.CountryRegion/text()'::text, resume, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))[1]::character varying(100) AS "Addr.Loc.CountryRegion", (xpath('n:Address/n:Addr.Location/n:Location/n:Loc.State/text()'::text, resume, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))[1]::character varying(100) AS "Addr.Loc.State", (xpath('n:Address/n:Addr.Location/n:Location/n:Loc.City/text()'::text, resume, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))[1]::character varying(100) AS "Addr.Loc.City", (xpath('n:Address/n:Addr.PostalCode/text()'::text, resume, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))[1]::character varying(20) AS "Addr.PostalCode", (xpath('/n:Resume/n:EMail/text()'::text, resume, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))[1]::character varying AS "EMail", (xpath('/n:Resume/n:WebSite/text()'::text, resume, '{{n,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))[1]::character varying AS "WebSite", modifieddate FROM humanresources.jobcandidate`,
  );

export const vjobcandidateemploymentInHumanresources = humanresources
  .view('vjobcandidateemployment', {
    jobcandidateid: integer(),
    empStartDate: date('Emp.StartDate'),
    empEndDate: date('Emp.EndDate'),
    empOrgName: varchar('Emp.OrgName', { length: 100 }),
    empJobTitle: varchar('Emp.JobTitle', { length: 100 }),
    empResponsibility: varchar('Emp.Responsibility'),
    empFunctionCategory: varchar('Emp.FunctionCategory'),
    empIndustryCategory: varchar('Emp.IndustryCategory'),
    empLocCountryRegion: varchar('Emp.Loc.CountryRegion'),
    empLocState: varchar('Emp.Loc.State'),
    empLocCity: varchar('Emp.Loc.City'),
  })
  .as(
    sql`SELECT jobcandidateid, unnest(xpath('/ns:Resume/ns:Employment/ns:Emp.StartDate/text()'::text, resume, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))::character varying(20)::date AS "Emp.StartDate", unnest(xpath('/ns:Resume/ns:Employment/ns:Emp.EndDate/text()'::text, resume, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))::character varying(20)::date AS "Emp.EndDate", unnest(xpath('/ns:Resume/ns:Employment/ns:Emp.OrgName/text()'::text, resume, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))::character varying(100) AS "Emp.OrgName", unnest(xpath('/ns:Resume/ns:Employment/ns:Emp.JobTitle/text()'::text, resume, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))::character varying(100) AS "Emp.JobTitle", unnest(xpath('/ns:Resume/ns:Employment/ns:Emp.Responsibility/text()'::text, resume, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))::character varying AS "Emp.Responsibility", unnest(xpath('/ns:Resume/ns:Employment/ns:Emp.FunctionCategory/text()'::text, resume, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))::character varying AS "Emp.FunctionCategory", unnest(xpath('/ns:Resume/ns:Employment/ns:Emp.IndustryCategory/text()'::text, resume, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))::character varying AS "Emp.IndustryCategory", unnest(xpath('/ns:Resume/ns:Employment/ns:Emp.Location/ns:Location/ns:Loc.CountryRegion/text()'::text, resume, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))::character varying AS "Emp.Loc.CountryRegion", unnest(xpath('/ns:Resume/ns:Employment/ns:Emp.Location/ns:Location/ns:Loc.State/text()'::text, resume, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))::character varying AS "Emp.Loc.State", unnest(xpath('/ns:Resume/ns:Employment/ns:Emp.Location/ns:Location/ns:Loc.City/text()'::text, resume, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[]))::character varying AS "Emp.Loc.City" FROM humanresources.jobcandidate`,
  );

export const vjobcandidateeducationInHumanresources = humanresources
  .view('vjobcandidateeducation', {
    jobcandidateid: integer(),
    eduLevel: varchar('Edu.Level', { length: 50 }),
    eduStartDate: date('Edu.StartDate'),
    eduEndDate: date('Edu.EndDate'),
    eduDegree: varchar('Edu.Degree', { length: 50 }),
    eduMajor: varchar('Edu.Major', { length: 50 }),
    eduMinor: varchar('Edu.Minor', { length: 50 }),
    eduGpa: varchar('Edu.GPA', { length: 5 }),
    eduGpaScale: varchar('Edu.GPAScale', { length: 5 }),
    eduSchool: varchar('Edu.School', { length: 100 }),
    eduLocCountryRegion: varchar('Edu.Loc.CountryRegion', { length: 100 }),
    eduLocState: varchar('Edu.Loc.State', { length: 100 }),
    eduLocCity: varchar('Edu.Loc.City', { length: 100 }),
  })
  .as(
    sql`SELECT jobcandidateid, (xpath('/root/ns:Education/ns:Edu.Level/text()'::text, doc, '{{ns,http://adventureworks.com}}'::text[]))[1]::character varying(50) AS "Edu.Level", (xpath('/root/ns:Education/ns:Edu.StartDate/text()'::text, doc, '{{ns,http://adventureworks.com}}'::text[]))[1]::character varying(20)::date AS "Edu.StartDate", (xpath('/root/ns:Education/ns:Edu.EndDate/text()'::text, doc, '{{ns,http://adventureworks.com}}'::text[]))[1]::character varying(20)::date AS "Edu.EndDate", (xpath('/root/ns:Education/ns:Edu.Degree/text()'::text, doc, '{{ns,http://adventureworks.com}}'::text[]))[1]::character varying(50) AS "Edu.Degree", (xpath('/root/ns:Education/ns:Edu.Major/text()'::text, doc, '{{ns,http://adventureworks.com}}'::text[]))[1]::character varying(50) AS "Edu.Major", (xpath('/root/ns:Education/ns:Edu.Minor/text()'::text, doc, '{{ns,http://adventureworks.com}}'::text[]))[1]::character varying(50) AS "Edu.Minor", (xpath('/root/ns:Education/ns:Edu.GPA/text()'::text, doc, '{{ns,http://adventureworks.com}}'::text[]))[1]::character varying(5) AS "Edu.GPA", (xpath('/root/ns:Education/ns:Edu.GPAScale/text()'::text, doc, '{{ns,http://adventureworks.com}}'::text[]))[1]::character varying(5) AS "Edu.GPAScale", (xpath('/root/ns:Education/ns:Edu.School/text()'::text, doc, '{{ns,http://adventureworks.com}}'::text[]))[1]::character varying(100) AS "Edu.School", (xpath('/root/ns:Education/ns:Edu.Location/ns:Location/ns:Loc.CountryRegion/text()'::text, doc, '{{ns,http://adventureworks.com}}'::text[]))[1]::character varying(100) AS "Edu.Loc.CountryRegion", (xpath('/root/ns:Education/ns:Edu.Location/ns:Location/ns:Loc.State/text()'::text, doc, '{{ns,http://adventureworks.com}}'::text[]))[1]::character varying(100) AS "Edu.Loc.State", (xpath('/root/ns:Education/ns:Edu.Location/ns:Location/ns:Loc.City/text()'::text, doc, '{{ns,http://adventureworks.com}}'::text[]))[1]::character varying(100) AS "Edu.Loc.City" FROM ( SELECT unnesting.jobcandidateid, (('<root xmlns:ns="http://adventureworks.com">'::text || unnesting.education::character varying::text) || '</root>'::text)::xml AS doc FROM ( SELECT jobcandidate.jobcandidateid, unnest(xpath('/ns:Resume/ns:Education'::text, jobcandidate.resume, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/Resume}}'::text[])) AS education FROM humanresources.jobcandidate) unnesting) jc`,
  );

export const vproductanddescriptionInProduction = production
  .materializedView('vproductanddescription', {
    productid: integer(),
    name: varchar('name', { length: 50 }),
    productmodel: varchar('productmodel', { length: 50 }),
    cultureid: char({ length: 6 }),
    description: varchar({ length: 400 }),
  })
  .as(
    sql`SELECT p.productid, p.name, pm.name AS productmodel, pmx.cultureid, pd.description FROM production.product p JOIN production.productmodel pm ON p.productmodelid = pm.productmodelid JOIN production.productmodelproductdescriptionculture pmx ON pm.productmodelid = pmx.productmodelid JOIN production.productdescription pd ON pmx.productdescriptionid = pd.productdescriptionid`,
  );

export const vproductmodelcatalogdescriptionInProduction = production
  .view('vproductmodelcatalogdescription', {
    productmodelid: integer(),
    name: varchar('name', { length: 50 }),
    summary: varchar('Summary'),
    manufacturer: varchar(),
    copyright: varchar({ length: 30 }),
    producturl: varchar({ length: 256 }),
    warrantyperiod: varchar({ length: 256 }),
    warrantydescription: varchar({ length: 256 }),
    noofyears: varchar({ length: 256 }),
    maintenancedescription: varchar({ length: 256 }),
    wheel: varchar({ length: 256 }),
    saddle: varchar({ length: 256 }),
    pedal: varchar({ length: 256 }),
    bikeframe: varchar(),
    crankset: varchar({ length: 256 }),
    pictureangle: varchar({ length: 256 }),
    picturesize: varchar({ length: 256 }),
    productphotoid: varchar({ length: 256 }),
    material: varchar({ length: 256 }),
    color: varchar({ length: 256 }),
    productline: varchar({ length: 256 }),
    style: varchar({ length: 256 }),
    riderexperience: varchar({ length: 1024 }),
    rowguid: uuid(),
    modifieddate: timestamp({ mode: 'string' }),
  })
  .as(
    sql`SELECT productmodelid, name, (xpath('/p1:ProductDescription/p1:Summary/html:p/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription},{html,http://www.w3.org/1999/xhtml}}'::text[]))[1]::character varying AS "Summary", (xpath('/p1:ProductDescription/p1:Manufacturer/p1:Name/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription}}'::text[]))[1]::character varying AS manufacturer, (xpath('/p1:ProductDescription/p1:Manufacturer/p1:Copyright/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription}}'::text[]))[1]::character varying(30) AS copyright, (xpath('/p1:ProductDescription/p1:Manufacturer/p1:ProductURL/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription}}'::text[]))[1]::character varying(256) AS producturl, (xpath('/p1:ProductDescription/p1:Features/wm:Warranty/wm:WarrantyPeriod/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription},{wm,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelWarrAndMain}}'::text[]))[1]::character varying(256) AS warrantyperiod, (xpath('/p1:ProductDescription/p1:Features/wm:Warranty/wm:Description/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription},{wm,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelWarrAndMain}}'::text[]))[1]::character varying(256) AS warrantydescription, (xpath('/p1:ProductDescription/p1:Features/wm:Maintenance/wm:NoOfYears/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription},{wm,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelWarrAndMain}}'::text[]))[1]::character varying(256) AS noofyears, (xpath('/p1:ProductDescription/p1:Features/wm:Maintenance/wm:Description/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription},{wm,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelWarrAndMain}}'::text[]))[1]::character varying(256) AS maintenancedescription, (xpath('/p1:ProductDescription/p1:Features/wf:wheel/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription},{wf,http://www.adventure-works.com/schemas/OtherFeatures}}'::text[]))[1]::character varying(256) AS wheel, (xpath('/p1:ProductDescription/p1:Features/wf:saddle/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription},{wf,http://www.adventure-works.com/schemas/OtherFeatures}}'::text[]))[1]::character varying(256) AS saddle, (xpath('/p1:ProductDescription/p1:Features/wf:pedal/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription},{wf,http://www.adventure-works.com/schemas/OtherFeatures}}'::text[]))[1]::character varying(256) AS pedal, (xpath('/p1:ProductDescription/p1:Features/wf:BikeFrame/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription},{wf,http://www.adventure-works.com/schemas/OtherFeatures}}'::text[]))[1]::character varying AS bikeframe, (xpath('/p1:ProductDescription/p1:Features/wf:crankset/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription},{wf,http://www.adventure-works.com/schemas/OtherFeatures}}'::text[]))[1]::character varying(256) AS crankset, (xpath('/p1:ProductDescription/p1:Picture/p1:Angle/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription}}'::text[]))[1]::character varying(256) AS pictureangle, (xpath('/p1:ProductDescription/p1:Picture/p1:Size/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription}}'::text[]))[1]::character varying(256) AS picturesize, (xpath('/p1:ProductDescription/p1:Picture/p1:ProductPhotoID/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription}}'::text[]))[1]::character varying(256) AS productphotoid, (xpath('/p1:ProductDescription/p1:Specifications/Material/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription}}'::text[]))[1]::character varying(256) AS material, (xpath('/p1:ProductDescription/p1:Specifications/Color/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription}}'::text[]))[1]::character varying(256) AS color, (xpath('/p1:ProductDescription/p1:Specifications/ProductLine/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription}}'::text[]))[1]::character varying(256) AS productline, (xpath('/p1:ProductDescription/p1:Specifications/Style/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription}}'::text[]))[1]::character varying(256) AS style, (xpath('/p1:ProductDescription/p1:Specifications/RiderExperience/text()'::text, catalogdescription, '{{p1,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelDescription}}'::text[]))[1]::character varying(1024) AS riderexperience, rowguid, modifieddate FROM production.productmodel WHERE catalogdescription IS NOT NULL`,
  );

export const vproductmodelinstructionsInProduction = production
  .view('vproductmodelinstructions', {
    productmodelid: integer(),
    name: varchar('name', { length: 50 }),
    instructions: varchar(),
    locationId: integer('LocationID'),
    setupHours: numeric('SetupHours', { precision: 9, scale: 4 }),
    machineHours: numeric('MachineHours', { precision: 9, scale: 4 }),
    laborHours: numeric('LaborHours', { precision: 9, scale: 4 }),
    lotSize: integer('LotSize'),
    step: varchar('Step', { length: 1024 }),
    rowguid: uuid(),
    modifieddate: timestamp({ mode: 'string' }),
  })
  .as(
    sql`SELECT productmodelid, name, (xpath('/ns:root/text()'::text, instructions, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelManuInstructions}}'::text[]))[1]::character varying AS instructions, (xpath('@LocationID'::text, mfginstructions))[1]::character varying::integer AS "LocationID", (xpath('@SetupHours'::text, mfginstructions))[1]::character varying::numeric(9,4) AS "SetupHours", (xpath('@MachineHours'::text, mfginstructions))[1]::character varying::numeric(9,4) AS "MachineHours", (xpath('@LaborHours'::text, mfginstructions))[1]::character varying::numeric(9,4) AS "LaborHours", (xpath('@LotSize'::text, mfginstructions))[1]::character varying::integer AS "LotSize", (xpath('/step/text()'::text, step))[1]::character varying(1024) AS "Step", rowguid, modifieddate FROM ( SELECT locations.productmodelid, locations.name, locations.rowguid, locations.modifieddate, locations.instructions, locations.mfginstructions, unnest(xpath('step'::text, locations.mfginstructions)) AS step FROM ( SELECT productmodel.productmodelid, productmodel.name, productmodel.rowguid, productmodel.modifieddate, productmodel.instructions, unnest(xpath('/ns:root/ns:Location'::text, productmodel.instructions, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/ProductModelManuInstructions}}'::text[])) AS mfginstructions FROM production.productmodel) locations) pm`,
  );

export const vsalespersonInSales = sales
  .view('vsalesperson', {
    businessentityid: integer(),
    title: varchar({ length: 8 }),
    firstname: varchar('firstname', { length: 50 }),
    middlename: varchar('middlename', { length: 50 }),
    lastname: varchar('lastname', { length: 50 }),
    suffix: varchar({ length: 10 }),
    jobtitle: varchar({ length: 50 }),
    phonenumber: varchar('phonenumber', { length: 25 }),
    phonenumbertype: varchar('phonenumbertype', { length: 50 }),
    emailaddress: varchar({ length: 50 }),
    emailpromotion: integer(),
    addressline1: varchar({ length: 60 }),
    addressline2: varchar({ length: 60 }),
    city: varchar({ length: 30 }),
    stateprovincename: varchar('stateprovincename', { length: 50 }),
    postalcode: varchar({ length: 15 }),
    countryregionname: varchar('countryregionname', { length: 50 }),
    territoryname: varchar('territoryname', { length: 50 }),
    territorygroup: varchar({ length: 50 }),
    salesquota: numeric(),
    salesytd: numeric(),
    saleslastyear: numeric(),
  })
  .as(
    sql`SELECT s.businessentityid, p.title, p.firstname, p.middlename, p.lastname, p.suffix, e.jobtitle, pp.phonenumber, pnt.name AS phonenumbertype, ea.emailaddress, p.emailpromotion, a.addressline1, a.addressline2, a.city, sp.name AS stateprovincename, a.postalcode, cr.name AS countryregionname, st.name AS territoryname, st."group" AS territorygroup, s.salesquota, s.salesytd, s.saleslastyear FROM sales.salesperson s JOIN humanresources.employee e ON e.businessentityid = s.businessentityid JOIN person.person p ON p.businessentityid = s.businessentityid JOIN person.businessentityaddress bea ON bea.businessentityid = s.businessentityid JOIN person.address a ON a.addressid = bea.addressid JOIN person.stateprovince sp ON sp.stateprovinceid = a.stateprovinceid JOIN person.countryregion cr ON cr.countryregioncode::text = sp.countryregioncode::text LEFT JOIN sales.salesterritory st ON st.territoryid = s.territoryid LEFT JOIN person.emailaddress ea ON ea.businessentityid = p.businessentityid LEFT JOIN person.personphone pp ON pp.businessentityid = p.businessentityid LEFT JOIN person.phonenumbertype pnt ON pnt.phonenumbertypeid = pp.phonenumbertypeid`,
  );

export const vsalespersonsalesbyfiscalyearsdataInSales = sales
  .view('vsalespersonsalesbyfiscalyearsdata', {
    salespersonid: integer(),
    fullname: text(),
    jobtitle: varchar({ length: 50 }),
    salesterritory: varchar('salesterritory', { length: 50 }),
    salestotal: numeric(),
    fiscalyear: numeric(),
  })
  .as(
    sql`SELECT salespersonid, fullname, jobtitle, salesterritory, sum(subtotal) AS salestotal, fiscalyear FROM ( SELECT soh.salespersonid, ((p.firstname::text || ' '::text) || COALESCE(p.middlename::text || ' '::text, ''::text)) || p.lastname::text AS fullname, e.jobtitle, st.name AS salesterritory, soh.subtotal, EXTRACT(year FROM soh.orderdate + '6 mons'::interval) AS fiscalyear FROM sales.salesperson sp JOIN sales.salesorderheader soh ON sp.businessentityid = soh.salespersonid JOIN sales.salesterritory st ON sp.territoryid = st.territoryid JOIN humanresources.employee e ON soh.salespersonid = e.businessentityid JOIN person.person p ON p.businessentityid = sp.businessentityid) granular GROUP BY salespersonid, fullname, jobtitle, salesterritory, fiscalyear`,
  );

export const vsalespersonsalesbyfiscalyearsInSales = sales
  .view('vsalespersonsalesbyfiscalyears', {
    '2012': numeric({ precision: 12, scale: 4 }),
    '2013': numeric({ precision: 12, scale: 4 }),
    '2014': numeric({ precision: 12, scale: 4 }),
    salesPersonId: integer('SalesPersonID'),
    fullName: text('FullName'),
    jobTitle: text('JobTitle'),
    salesTerritory: text('SalesTerritory'),
  })
  .as(
    sql`SELECT "SalesPersonID", "FullName", "JobTitle", "SalesTerritory", "2012", "2013", "2014" FROM crosstab('SELECT SalesPersonID ,FullName ,JobTitle ,SalesTerritory ,FiscalYear ,SalesTotal FROM Sales.vSalesPersonSalesByFiscalYearsData ORDER BY 2,4'::text, 'SELECT unnest(''{2012,2013,2014}''::text[])'::text) salestotal("SalesPersonID" integer, "FullName" text, "JobTitle" text, "SalesTerritory" text, "2012" numeric(12,4), "2013" numeric(12,4), "2014" numeric(12,4))`,
  );

export const vstorewithaddressesInSales = sales
  .view('vstorewithaddresses', {
    businessentityid: integer(),
    name: varchar('name', { length: 50 }),
    addresstype: varchar('addresstype', { length: 50 }),
    addressline1: varchar({ length: 60 }),
    addressline2: varchar({ length: 60 }),
    city: varchar({ length: 30 }),
    stateprovincename: varchar('stateprovincename', { length: 50 }),
    postalcode: varchar({ length: 15 }),
    countryregionname: varchar('countryregionname', { length: 50 }),
  })
  .as(
    sql`SELECT s.businessentityid, s.name, at.name AS addresstype, a.addressline1, a.addressline2, a.city, sp.name AS stateprovincename, a.postalcode, cr.name AS countryregionname FROM sales.store s JOIN person.businessentityaddress bea ON bea.businessentityid = s.businessentityid JOIN person.address a ON a.addressid = bea.addressid JOIN person.stateprovince sp ON sp.stateprovinceid = a.stateprovinceid JOIN person.countryregion cr ON cr.countryregioncode::text = sp.countryregioncode::text JOIN person.addresstype at ON at.addresstypeid = bea.addresstypeid`,
  );

export const vvendorwithcontactsInPurchasing = purchasing
  .view('vvendorwithcontacts', {
    businessentityid: integer(),
    name: varchar('name', { length: 50 }),
    contacttype: varchar('contacttype', { length: 50 }),
    title: varchar({ length: 8 }),
    firstname: varchar('firstname', { length: 50 }),
    middlename: varchar('middlename', { length: 50 }),
    lastname: varchar('lastname', { length: 50 }),
    suffix: varchar({ length: 10 }),
    phonenumber: varchar('phonenumber', { length: 25 }),
    phonenumbertype: varchar('phonenumbertype', { length: 50 }),
    emailaddress: varchar({ length: 50 }),
    emailpromotion: integer(),
  })
  .as(
    sql`SELECT v.businessentityid, v.name, ct.name AS contacttype, p.title, p.firstname, p.middlename, p.lastname, p.suffix, pp.phonenumber, pnt.name AS phonenumbertype, ea.emailaddress, p.emailpromotion FROM purchasing.vendor v JOIN person.businessentitycontact bec ON bec.businessentityid = v.businessentityid JOIN person.contacttype ct ON ct.contacttypeid = bec.contacttypeid JOIN person.person p ON p.businessentityid = bec.personid LEFT JOIN person.emailaddress ea ON ea.businessentityid = p.businessentityid LEFT JOIN person.personphone pp ON pp.businessentityid = p.businessentityid LEFT JOIN person.phonenumbertype pnt ON pnt.phonenumbertypeid = pp.phonenumbertypeid`,
  );

export const vvendorwithaddressesInPurchasing = purchasing
  .view('vvendorwithaddresses', {
    businessentityid: integer(),
    name: varchar('name', { length: 50 }),
    addresstype: varchar('addresstype', { length: 50 }),
    addressline1: varchar({ length: 60 }),
    addressline2: varchar({ length: 60 }),
    city: varchar({ length: 30 }),
    stateprovincename: varchar('stateprovincename', { length: 50 }),
    postalcode: varchar({ length: 15 }),
    countryregionname: varchar('countryregionname', { length: 50 }),
  })
  .as(
    sql`SELECT v.businessentityid, v.name, at.name AS addresstype, a.addressline1, a.addressline2, a.city, sp.name AS stateprovincename, a.postalcode, cr.name AS countryregionname FROM purchasing.vendor v JOIN person.businessentityaddress bea ON bea.businessentityid = v.businessentityid JOIN person.address a ON a.addressid = bea.addressid JOIN person.stateprovince sp ON sp.stateprovinceid = a.stateprovinceid JOIN person.countryregion cr ON cr.countryregioncode::text = sp.countryregioncode::text JOIN person.addresstype at ON at.addresstypeid = bea.addresstypeid`,
  );

export const vstateprovincecountryregionInPerson = person
  .materializedView('vstateprovincecountryregion', {
    stateprovinceid: integer(),
    stateprovincecode: char({ length: 3 }),
    isonlystateprovinceflag: boolean('isonlystateprovinceflag'),
    stateprovincename: varchar('stateprovincename', { length: 50 }),
    territoryid: integer(),
    countryregioncode: varchar({ length: 3 }),
    countryregionname: varchar('countryregionname', { length: 50 }),
  })
  .as(
    sql`SELECT sp.stateprovinceid, sp.stateprovincecode, sp.isonlystateprovinceflag, sp.name AS stateprovincename, sp.territoryid, cr.countryregioncode, cr.name AS countryregionname FROM person.stateprovince sp JOIN person.countryregion cr ON sp.countryregioncode::text = cr.countryregioncode::text`,
  );

export const vstorewithdemographicsInSales = sales
  .view('vstorewithdemographics', {
    businessentityid: integer(),
    name: varchar('name', { length: 50 }),
    annualSales: numeric('AnnualSales', { precision: 19, scale: 4 }),
    annualRevenue: numeric('AnnualRevenue', { precision: 19, scale: 4 }),
    bankName: varchar('BankName', { length: 50 }),
    businessType: varchar('BusinessType', { length: 5 }),
    yearOpened: integer('YearOpened'),
    specialty: varchar('Specialty', { length: 50 }),
    squareFeet: integer('SquareFeet'),
    brands: varchar('Brands', { length: 30 }),
    internet: varchar('Internet', { length: 30 }),
    numberEmployees: integer('NumberEmployees'),
  })
  .as(
    sql`SELECT businessentityid, name, unnest(xpath('/ns:StoreSurvey/ns:AnnualSales/text()'::text, demographics, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/StoreSurvey}}'::text[]))::character varying::money AS "AnnualSales", unnest(xpath('/ns:StoreSurvey/ns:AnnualRevenue/text()'::text, demographics, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/StoreSurvey}}'::text[]))::character varying::money AS "AnnualRevenue", unnest(xpath('/ns:StoreSurvey/ns:BankName/text()'::text, demographics, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/StoreSurvey}}'::text[]))::character varying(50) AS "BankName", unnest(xpath('/ns:StoreSurvey/ns:BusinessType/text()'::text, demographics, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/StoreSurvey}}'::text[]))::character varying(5) AS "BusinessType", unnest(xpath('/ns:StoreSurvey/ns:YearOpened/text()'::text, demographics, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/StoreSurvey}}'::text[]))::character varying::integer AS "YearOpened", unnest(xpath('/ns:StoreSurvey/ns:Specialty/text()'::text, demographics, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/StoreSurvey}}'::text[]))::character varying(50) AS "Specialty", unnest(xpath('/ns:StoreSurvey/ns:SquareFeet/text()'::text, demographics, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/StoreSurvey}}'::text[]))::character varying::integer AS "SquareFeet", unnest(xpath('/ns:StoreSurvey/ns:Brands/text()'::text, demographics, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/StoreSurvey}}'::text[]))::character varying(30) AS "Brands", unnest(xpath('/ns:StoreSurvey/ns:Internet/text()'::text, demographics, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/StoreSurvey}}'::text[]))::character varying(30) AS "Internet", unnest(xpath('/ns:StoreSurvey/ns:NumberEmployees/text()'::text, demographics, '{{ns,http://schemas.microsoft.com/sqlserver/2004/07/adventure-works/StoreSurvey}}'::text[]))::character varying::integer AS "NumberEmployees" FROM sales.store`,
  );

export const vstorewithcontactsInSales = sales
  .view('vstorewithcontacts', {
    businessentityid: integer(),
    name: varchar('name', { length: 50 }),
    contacttype: varchar('contacttype', { length: 50 }),
    title: varchar({ length: 8 }),
    firstname: varchar('firstname', { length: 50 }),
    middlename: varchar('middlename', { length: 50 }),
    lastname: varchar('lastname', { length: 50 }),
    suffix: varchar({ length: 10 }),
    phonenumber: varchar('phonenumber', { length: 25 }),
    phonenumbertype: varchar('phonenumbertype', { length: 50 }),
    emailaddress: varchar({ length: 50 }),
    emailpromotion: integer(),
  })
  .as(
    sql`SELECT s.businessentityid, s.name, ct.name AS contacttype, p.title, p.firstname, p.middlename, p.lastname, p.suffix, pp.phonenumber, pnt.name AS phonenumbertype, ea.emailaddress, p.emailpromotion FROM sales.store s JOIN person.businessentitycontact bec ON bec.businessentityid = s.businessentityid JOIN person.contacttype ct ON ct.contacttypeid = bec.contacttypeid JOIN person.person p ON p.businessentityid = bec.personid LEFT JOIN person.emailaddress ea ON ea.businessentityid = p.businessentityid LEFT JOIN person.personphone pp ON pp.businessentityid = p.businessentityid LEFT JOIN person.phonenumbertype pnt ON pnt.phonenumbertypeid = pp.phonenumbertypeid`,
  );
