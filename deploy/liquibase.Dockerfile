# Liquibase with MongoDB support. It takes TWO packages, and the names mislead:
#   liquibase-mongodb  the extension: teaches Liquibase the mongodb:// protocol
#   mongodb            the Java driver the extension needs to connect
# Installing only `mongodb` looks like it worked and fails with
# "Driver class was not specified and could not be determined from the url".
FROM liquibase/liquibase:4.29
RUN lpm add liquibase-mongodb mongodb --global
