# WikiNearby

**WikiNearby** is a tool to see Wikipedia articles near a given sets of coordinates, a given article, or your location. It is hosted at <https://wikinearby.toolforge.org/>.

## Installing

The required Python dependences are located in `requirements.txt`. They can be Installed with the command `pip install -r requirements.txt`.

### Config

Copy the file `config-example.ini` to `config.ini` and fill in the fields with the values from your `replica.my.cnf`.

## Development

Enable development by setting `dev` to `yes` in the `config.ini`. In this mode the tool connects to the database at `localhost` using port `4711` for the `meta` database and `4712` for the Wikipedia databases.

You can connect to the database replicas using the command `ssh -N USERNAME@login.toolforge.org -L 4711:meta.web.db.svc.wikimedia.cloud:3306 -L 4712:enwiki.web.db.svc.wikimedia.cloud:3306`. `enwiki` can be replaced with the name of the database of any other Wikipedia.
